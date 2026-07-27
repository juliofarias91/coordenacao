"""Motor da auditoria automatizada.

Dado uma versão de modelo, descobre quais critérios do checklist são
automatizáveis, roda o verificador correspondente e grava
`resultado_check` + `ocorrencia`. É a "costura da automação" que a
especificação descreve: o worker escreve no mesmo lugar em que o auditor
escreve, e o campo `origem` diz quem foi.

**Regra que não pode ser quebrada:** o worker nunca sobrescreve julgamento
humano. Se alguém já mexeu num resultado (`origem = manual`), ele fica como
está. O automático só preenche o que ainda está pendente ou o que ele mesmo
escreveu antes.
"""

from __future__ import annotations

import logging
import os
import tempfile
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Auditoria,
    Criterio,
    Disciplina,
    Modelo,
    NomenclaturaPadrao,
    Ocorrencia,
    ResultadoCheck,
    Standard,
    VersaoModelo,
)
from app.models.enums import (
    AuditoriaEstado,
    Automacao,
    CheckStatus,
    OrigemResult,
    VersaoFormato,
)
from app.services import storage
from app.services.auditoria import abrir_auditoria, checklists_da_versao, recalcular_aprovacao
from app.services.automacao import ifc as motor_ifc
from app.services.automacao import nomenclatura as motor_nome
from app.services.automacao.ifc import Contagem, Ocorrido

log = logging.getLogger(__name__)


@dataclass
class Achado:
    """O que um verificador devolve. Vira uma linha de `resultado_check`."""

    status: CheckStatus
    comentario: str
    itens_analisados: int | None = None
    itens_ok: int | None = None
    ocorrencias: list[Ocorrido] = field(default_factory=list)


@dataclass
class Contexto:
    """Tudo que um verificador pode precisar, montado uma vez por versão."""

    db: Session
    versao: VersaoModelo
    modelo: Modelo
    criterio: Criterio
    disciplina: Disciplina | None
    segmentos: list[dict] = field(default_factory=list)
    vocabulario: list[str] = field(default_factory=list)
    # Aberto sob demanda: critério que não olha o modelo não paga o parse.
    _ifc: object | None = None
    caminho_ifc: str | None = None

    def ifc(self):
        if self._ifc is None:
            if not self.caminho_ifc:
                raise ArquivoIndisponivel("versão sem arquivo IFC baixado")
            self._ifc = motor_ifc.abrir(self.caminho_ifc)
        return self._ifc


class ArquivoIndisponivel(RuntimeError):
    """A checagem precisa do arquivo e ele não está disponível."""


Verificador = Callable[[Contexto], Achado]


# --------------------------------------------------------------------------
# Verificadores
# --------------------------------------------------------------------------
def _de_contagem(contagem: Contagem, *, assunto: str, nada_a_verificar: str) -> Achado:
    """Converte uma contagem do motor IFC em achado.

    Zero itens analisados não é aprovação: é ausência de evidência, e vira
    N/A para não inflar o percentual do round.
    """
    if contagem.analisados == 0:
        return Achado(status=CheckStatus.NA, comentario=nada_a_verificar)

    falhas = contagem.analisados - contagem.ok
    if falhas == 0:
        return Achado(
            status=CheckStatus.APROVADO,
            comentario=f"{contagem.analisados} {assunto} verificados, nenhuma falha",
            itens_analisados=contagem.analisados,
            itens_ok=contagem.ok,
        )

    comentario = f"{falhas} de {contagem.analisados} {assunto} com falha"
    if contagem.truncado:
        comentario += (
            f"; apenas os primeiros {motor_ifc.LIMITE_OCORRENCIAS} IDs foram registrados"
        )
    return Achado(
        status=CheckStatus.REPROVADO,
        comentario=comentario,
        itens_analisados=contagem.analisados,
        itens_ok=contagem.ok,
        ocorrencias=contagem.ocorrencias,
    )


def verificar_nome_do_modelo(ctx: Contexto) -> Achado:
    """SP-301 aplicado dentro da auditoria: o nome do arquivo é um critério."""
    if not ctx.segmentos:
        return Achado(
            status=CheckStatus.NA,
            comentario="projeto sem padrão de nomenclatura cadastrado",
        )
    veredito = motor_nome.validar(ctx.modelo.codigo, ctx.segmentos)
    return Achado(
        status=CheckStatus.APROVADO if veredito.ok else CheckStatus.REPROVADO,
        comentario=veredito.mensagem,
        itens_analisados=len(veredito.segmentos),
        itens_ok=sum(1 for s in veredito.segmentos if s.ok),
    )


def verificar_parametros(ctx: Contexto) -> Achado:
    """SP-303/304 · presença dos parâmetros esperados por elemento.

    O critério pode pedir mais de um parâmetro, separados por vírgula
    (`4D_DISCIPLINE, 4D_AREA`) — é como o A5.37 lista as exigências. A mesma
    regra roda sobre IFC (IfcOpenShell, grátis) ou sobre Revit (APS Model
    Derivative, com custo de token): muda o extrator, não o critério.
    """
    pedidos = [
        p.strip() for p in (ctx.criterio.parametro_esperado or "").split(",") if p.strip()
    ]
    if not pedidos:
        return Achado(
            status=CheckStatus.NA,
            comentario="critério sem `parametro_esperado` definido na biblioteca",
        )

    if ctx.versao.formato == VersaoFormato.REVIT:
        from app.services.automacao import revit as motor_revit

        if not ctx.versao.urn:
            return Achado(
                status=CheckStatus.NA,
                comentario="versão Revit sem URN traduzida no APS; nada a extrair",
            )
        contagem = motor_revit.auditar_parametros_por_urn(ctx.versao.urn, pedidos)
        if contagem.analisados == 0:
            return Achado(
                status=CheckStatus.NA,
                comentario="tradução do modelo ainda em andamento no APS; reenfileire",
            )
    else:
        contagem = motor_ifc.auditar_parametros(ctx.ifc(), pedidos)

    return _de_contagem(
        contagem,
        assunto="elementos",
        nada_a_verificar="modelo sem elementos para verificar",
    )


def verificar_categorias_ifc(ctx: Contexto) -> Achado:
    """SP-305 · IfcElementAssembly contra o dicionário do projeto."""
    if not ctx.vocabulario:
        return Achado(
            status=CheckStatus.NA,
            comentario="projeto sem dicionário IFC cadastrado (Standard do tipo vocabulário)",
        )
    contagem = motor_ifc.auditar_categorias(ctx.ifc(), ctx.vocabulario)
    return _de_contagem(
        contagem,
        assunto="conjuntos",
        nada_a_verificar="modelo sem IfcElementAssembly",
    )


def verificar_elementos_satelite(ctx: Contexto) -> Achado:
    contagem = motor_ifc.auditar_elementos_soltos(ctx.ifc())
    return _de_contagem(
        contagem,
        assunto="elementos",
        nada_a_verificar="modelo sem elementos para verificar",
    )


# Chave = `criterio.codigo` da biblioteca. Critério sem entrada aqui cai no
# verificador genérico de parâmetro, se tiver `parametro_esperado`.
VERIFICADORES: dict[str, Verificador] = {
    "MODEL_NAME": verificar_nome_do_modelo,
    "SATELLITE": verificar_elementos_satelite,
    "CATEGORY_IFC": verificar_categorias_ifc,
    "CAT_SHARED_PARAMS": verificar_parametros,
}

# Verificadores que não abrem o modelo — rodam mesmo sem arquivo baixado.
SEM_ARQUIVO = {"MODEL_NAME"}


def _impedimento(criterio: Criterio, versao: VersaoModelo, caminho_ifc: str | None) -> str | None:
    """Por que este critério não pode rodar agora — ou None se pode."""
    if criterio.codigo.upper() in SEM_ARQUIVO:
        return None
    if versao.formato == VersaoFormato.REVIT:
        # O caminho Revit não usa arquivo local: fala com o APS pela URN.
        return None if versao.urn else "versão Revit sem URN do APS"
    return None if caminho_ifc else "versão sem arquivo IFC disponível para análise"


def verificadores_disponiveis() -> list[str]:
    return sorted(VERIFICADORES)


def _escolher(criterio: Criterio) -> Verificador | None:
    especifico = VERIFICADORES.get(criterio.codigo.upper())
    if especifico is not None:
        return especifico
    # Critério dirigido por dado: qualquer 4D_* ou BF_* cai aqui.
    if criterio.parametro_esperado:
        return verificar_parametros
    return None


# --------------------------------------------------------------------------
# Execução
# --------------------------------------------------------------------------
@dataclass
class RelatorioExecucao:
    versao_id: uuid.UUID
    auditorias: list[uuid.UUID] = field(default_factory=list)
    avaliados: int = 0
    aprovados: int = 0
    reprovados: int = 0
    na: int = 0
    preservados: int = 0
    sem_verificador: int = 0
    erros: list[str] = field(default_factory=list)

    @property
    def resumo(self) -> str:
        return (
            f"{self.avaliados} critério(s) automatizados: {self.aprovados} aprovado(s), "
            f"{self.reprovados} reprovado(s), {self.na} N/A. "
            f"{self.preservados} preservado(s) por edição manual."
        )


def _contexto_base(
    db: Session, versao: VersaoModelo
) -> tuple[Modelo, Disciplina | None, list, list]:
    modelo = db.get(Modelo, versao.modelo_id)
    if modelo is None:
        raise ValueError("versão sem modelo")

    disciplina = (
        db.get(Disciplina, modelo.disciplina_id) if modelo.disciplina_id else None
    )

    padrao = db.execute(
        select(NomenclaturaPadrao)
        .where(
            NomenclaturaPadrao.projeto_id == modelo.projeto_id,
            NomenclaturaPadrao.vigente.is_(True),
        )
        .order_by(NomenclaturaPadrao.created_at.desc())
    ).scalars().first()
    segmentos = list(padrao.segmentos) if padrao else []

    dicionarios = db.execute(
        select(Standard).where(
            Standard.projeto_id == modelo.projeto_id, Standard.tipo == "vocabulario"
        )
    ).scalars()
    vocabulario: list[str] = []
    for standard in dicionarios:
        conteudo = standard.conteudo or {}
        termos = conteudo.get("termos") or conteudo.get("valores") or []
        vocabulario.extend(str(t) for t in termos)

    return modelo, disciplina, segmentos, vocabulario


def executar_auditoria_automatica(
    db: Session,
    versao: VersaoModelo,
    *,
    org_id: uuid.UUID,
    auditor_id: uuid.UUID | None = None,
) -> RelatorioExecucao:
    """Roda toda a automação aplicável a esta versão.

    Função pura de infraestrutura de fila: o worker Celery é só um invólucro
    em volta dela, e os testes a chamam direto.
    """
    relatorio = RelatorioExecucao(versao_id=versao.id)
    modelo, disciplina, segmentos, vocabulario = _contexto_base(db, versao)

    # Abre (ou reaproveita) as auditorias dos checklists da disciplina.
    for checklist in checklists_da_versao(db, versao):
        auditoria = abrir_auditoria(
            db, org_id=org_id, versao=versao, checklist=checklist, auditor_id=auditor_id
        )
        relatorio.auditorias.append(auditoria.id)

    auditorias = list(
        db.execute(select(Auditoria).where(Auditoria.versao_id == versao.id)).scalars()
    )

    caminho = None
    temporario = None
    try:
        if versao.formato == VersaoFormato.IFC and versao.arquivo_url:
            fd, temporario = tempfile.mkstemp(suffix=".ifc")
            os.close(fd)
            caminho = storage.baixar_para_arquivo(versao.arquivo_url, temporario)

        for auditoria in auditorias:
            if auditoria.estado == AuditoriaEstado.PUBLICADO:
                continue  # round fechado não é reescrito
            _executar_em(
                db,
                auditoria,
                relatorio=relatorio,
                org_id=org_id,
                modelo=modelo,
                versao=versao,
                disciplina=disciplina,
                segmentos=segmentos,
                vocabulario=vocabulario,
                caminho_ifc=caminho,
            )
            recalcular_aprovacao(db, auditoria)
    finally:
        if temporario and os.path.exists(temporario):
            os.unlink(temporario)

    return relatorio


def _executar_em(
    db: Session,
    auditoria: Auditoria,
    *,
    relatorio: RelatorioExecucao,
    org_id: uuid.UUID,
    modelo: Modelo,
    versao: VersaoModelo,
    disciplina: Disciplina | None,
    segmentos: list,
    vocabulario: list,
    caminho_ifc: str | None,
) -> None:
    resultados = list(
        db.execute(
            select(ResultadoCheck)
            .join(Criterio, Criterio.id == ResultadoCheck.criterio_id)
            .where(
                ResultadoCheck.auditoria_id == auditoria.id,
                Criterio.automacao == Automacao.AUTO,
            )
        ).scalars()
    )

    contexto_compartilhado: Contexto | None = None

    for resultado in resultados:
        criterio = db.get(Criterio, resultado.criterio_id)
        if criterio is None:
            continue

        verificador = _escolher(criterio)
        if verificador is None:
            relatorio.sem_verificador += 1
            continue

        # Julgamento humano é intocável.
        if resultado.origem == OrigemResult.MANUAL and resultado.status != CheckStatus.PENDENTE:
            relatorio.preservados += 1
            continue

        impedimento = _impedimento(criterio, versao, caminho_ifc)
        if impedimento:
            relatorio.erros.append(f"{criterio.codigo}: {impedimento}")
            continue

        if contexto_compartilhado is None:
            contexto_compartilhado = Contexto(
                db=db,
                versao=versao,
                modelo=modelo,
                criterio=criterio,
                disciplina=disciplina,
                segmentos=segmentos,
                vocabulario=vocabulario,
                caminho_ifc=caminho_ifc,
            )
        ctx = contexto_compartilhado
        ctx.criterio = criterio  # o IFC aberto é reaproveitado entre critérios

        try:
            achado = verificador(ctx)
        except Exception as exc:  # noqa: BLE001 - um critério não derruba o round
            log.exception("falha ao verificar %s", criterio.codigo)
            relatorio.erros.append(f"{criterio.codigo}: {type(exc).__name__}: {exc}")
            continue

        resultado.status = achado.status
        resultado.origem = OrigemResult.AUTOMATICO
        resultado.comentario = achado.comentario
        resultado.itens_analisados = achado.itens_analisados
        resultado.itens_ok = achado.itens_ok

        for antiga in list(resultado.ocorrencias):
            db.delete(antiga)
        db.flush()
        for ocorrido in achado.ocorrencias:
            db.add(
                Ocorrencia(
                    org_id=org_id,
                    resultado_id=resultado.id,
                    element_id=ocorrido.element_id,
                    detalhe=ocorrido.detalhe,
                )
            )

        relatorio.avaliados += 1
        if achado.status == CheckStatus.APROVADO:
            relatorio.aprovados += 1
        elif achado.status == CheckStatus.REPROVADO:
            relatorio.reprovados += 1
        else:
            relatorio.na += 1

    db.flush()
