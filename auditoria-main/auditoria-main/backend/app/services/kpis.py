"""SP-402/403 · Indicadores e placar de conformidade.

Tudo aqui é derivado das auditorias — mesma regra do painel. Nenhum número
desta tela é digitado em lugar nenhum.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Auditoria,
    Criterio,
    Empresa,
    Modelo,
    NaoConformidade,
    Penalidade,
    ResultadoCheck,
    VersaoModelo,
)
from app.models.enums import AuditoriaEstado, CheckStatus
from app.services.painel import CORES_MACRO, painel_de_controle


def _media(valores: list[Decimal]) -> Decimal | None:
    if not valores:
        return None
    return (sum(valores) / Decimal(len(valores))).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


@dataclass
class Fatia:
    rotulo: str
    valor: float
    cor: str | None = None
    # Chave estável (a letra da macro, o código do estado). O frontend mapeia
    # a chave para um token de cor do tema — assim o gráfico acompanha o modo
    # escuro, que precisa dos seus próprios passos de cor, não de um inverso
    # automático do claro.
    chave: str | None = None


@dataclass
class PontoEvolucao:
    round: int
    aprovacao_media: float | None
    auditorias: int


@dataclass
class KPIs:
    projeto_id: uuid.UUID
    modelos: int
    versoes: int
    auditorias_publicadas: int
    aprovacao_media: Decimal | None
    ncs_abertas: int
    ncs_resolvidas: int
    por_macro: list[Fatia] = field(default_factory=list)
    por_estado: list[Fatia] = field(default_factory=list)
    por_status_de_item: list[Fatia] = field(default_factory=list)
    evolucao: list[PontoEvolucao] = field(default_factory=list)
    criterios_mais_reprovados: list[Fatia] = field(default_factory=list)


@dataclass
class LinhaPlacar:
    empresa_id: uuid.UUID
    empresa: str
    modelos: int
    aprovacao_media: Decimal | None
    ncs_abertas: int
    penalidades: int
    # Nulo quando a empresa ainda não tem nada auditado. Zero diria "péssimo",
    # e não é a mesma coisa que "ainda não olhamos".
    indice: Decimal | None
    avaliado: bool


def _auditorias_do_projeto(projeto_id: uuid.UUID):
    return (
        select(Auditoria)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
    )


def calcular(db: Session, projeto_id: uuid.UUID) -> KPIs:
    linhas = painel_de_controle(db, projeto_id)

    modelos = len(linhas)
    versoes = db.execute(
        select(func.count(VersaoModelo.id))
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
    ).scalar_one()

    auditorias = list(db.execute(_auditorias_do_projeto(projeto_id)).scalars())

    publicadas = [a for a in auditorias if a.estado == AuditoriaEstado.PUBLICADO]
    pcts = [a.aprovacao_pct for a in auditorias if a.aprovacao_pct is not None]

    # --- aprovação por macrodisciplina ------------------------------------
    por_macro_bruto: dict[str, list[Decimal]] = {}
    for linha in linhas:
        if linha.macro is None or linha.aprovacao_pct is None:
            continue
        por_macro_bruto.setdefault(linha.macro, []).append(linha.aprovacao_pct)

    rotulos_macro = {"A": "ARCH", "C": "CIVIL/ESTRUT", "M": "MEP", "S": "SITE"}
    por_macro = [
        Fatia(
            rotulo=rotulos_macro.get(macro, macro),
            valor=float(_media(valores) or 0),
            cor=CORES_MACRO.get(macro),
            chave=macro,
        )
        for macro, valores in sorted(por_macro_bruto.items())
    ]

    # --- distribuição de estados dos modelos ------------------------------
    rotulos_estado = {
        "publicado": ("Publicado", "var(--ok)"),
        "nao_publicado": ("Não publicado", "var(--na)"),
        "desatualizado": ("Desatualizado", "var(--wait)"),
    }
    contagem_estado: dict[str, int] = {}
    for linha in linhas:
        chave = linha.estado or "nao_publicado"
        contagem_estado[chave] = contagem_estado.get(chave, 0) + 1
    por_estado = [
        Fatia(
            rotulo=rotulos_estado.get(k, (k, None))[0],
            valor=v,
            cor=rotulos_estado.get(k, (k, None))[1],
            chave=k,
        )
        for k, v in contagem_estado.items()
    ]

    # --- distribuição dos itens verificados -------------------------------
    status_bruto = db.execute(
        select(ResultadoCheck.status, func.count())
        .join(Auditoria, Auditoria.id == ResultadoCheck.auditoria_id)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
        .group_by(ResultadoCheck.status)
    ).all()
    rotulos_status = {
        CheckStatus.APROVADO: ("Aprovado", "var(--ok)"),
        CheckStatus.REPROVADO: ("Reprovado", "var(--bad)"),
        CheckStatus.PENDENTE: ("Pendente", "var(--wait)"),
        CheckStatus.NA: ("N/A", "var(--na)"),
    }
    por_status_de_item = [
        Fatia(
            rotulo=rotulos_status[s][0],
            valor=n,
            cor=rotulos_status[s][1],
            chave=s.value,
        )
        for s, n in status_bruto
        if s in rotulos_status
    ]

    # --- evolução por round -----------------------------------------------
    # É o gráfico que responde "estamos melhorando?": se o round 3 aprova mais
    # que o round 1, a conversa com o fornecedor está funcionando.
    por_round: dict[int, list[Decimal]] = {}
    for a in auditorias:
        if a.round is None or a.aprovacao_pct is None:
            continue
        por_round.setdefault(a.round, []).append(a.aprovacao_pct)
    evolucao = [
        PontoEvolucao(
            round=r,
            aprovacao_media=float(_media(v) or 0),
            auditorias=len(v),
        )
        for r, v in sorted(por_round.items())
    ]

    # --- critérios que mais reprovam --------------------------------------
    reprovados = db.execute(
        select(Criterio.nome_pt, func.count())
        .join(ResultadoCheck, ResultadoCheck.criterio_id == Criterio.id)
        .join(Auditoria, Auditoria.id == ResultadoCheck.auditoria_id)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(
            Modelo.projeto_id == projeto_id,
            ResultadoCheck.status == CheckStatus.REPROVADO,
        )
        .group_by(Criterio.nome_pt)
        .order_by(func.count().desc())
        .limit(8)
    ).all()

    ncs = db.execute(
        select(NaoConformidade.status, func.count())
        .join(Auditoria, Auditoria.id == NaoConformidade.auditoria_id)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
        .group_by(NaoConformidade.status)
    ).all()
    contagem_nc = {str(status): total for status, total in ncs}

    return KPIs(
        projeto_id=projeto_id,
        modelos=modelos,
        versoes=versoes,
        auditorias_publicadas=len(publicadas),
        aprovacao_media=_media(pcts),
        ncs_abertas=sum(v for k, v in contagem_nc.items() if k != "resolvido"),
        ncs_resolvidas=contagem_nc.get("resolvido", 0),
        por_macro=por_macro,
        por_estado=por_estado,
        por_status_de_item=por_status_de_item,
        evolucao=evolucao,
        criterios_mais_reprovados=[Fatia(rotulo=nome, valor=n) for nome, n in reprovados],
    )


# --------------------------------------------------------------------------
# SP-402 · placar de conformidade
# --------------------------------------------------------------------------
# Pesos do índice. A aprovação domina porque é o que o contrato cobra; NC
# aberta e penalidade descontam porque medem o atrito que o fornecedor gera
# na coordenação. Os três números que compõem o índice vão junto na resposta,
# para o placar poder ser contestado com dado, não com opinião.
PESO_APROVACAO = Decimal("1.0")
DESCONTO_POR_NC = Decimal("2.0")
DESCONTO_POR_PENALIDADE = Decimal("3.0")


def placar(db: Session, projeto_id: uuid.UUID) -> list[LinhaPlacar]:
    """Índice por empresa, do melhor para o pior.

    A empresa entra pelo papel de instaladora do modelo — é ela que responde
    pela entrega, ainda que outra tenha modelado.
    """
    linhas_painel = painel_de_controle(db, projeto_id)

    modelos = {
        m.id: m
        for m in db.execute(select(Modelo).where(Modelo.projeto_id == projeto_id)).scalars()
    }
    empresas = {e.id: e for e in db.execute(select(Empresa)).scalars()}

    agregado: dict[uuid.UUID, dict] = {}
    for linha in linhas_painel:
        modelo = modelos.get(linha.modelo_id)
        if modelo is None or modelo.instaladora_id is None:
            continue
        dados = agregado.setdefault(
            modelo.instaladora_id, {"modelos": 0, "pcts": [], "ncs": 0}
        )
        dados["modelos"] += 1
        if linha.aprovacao_pct is not None:
            dados["pcts"].append(linha.aprovacao_pct)
        dados["ncs"] += linha.ncs_abertas

    penalidades = {
        empresa_id: int(total)
        for empresa_id, total in db.execute(
            select(Penalidade.empresa_id, func.coalesce(func.sum(Penalidade.peso), 0)).group_by(
                Penalidade.empresa_id
            )
        ).all()
    }

    placar_final: list[LinhaPlacar] = []
    for empresa_id, dados in agregado.items():
        empresa = empresas.get(empresa_id)
        if empresa is None:
            continue

        aprovacao = _media(dados["pcts"])
        penalidade = penalidades.get(empresa_id, 0)

        # Uma empresa só entra no ranking quando existe algo medido sobre ela:
        # aprovação, NC ou penalidade. Sem nada disso, ela tem modelo
        # cadastrado e nenhum round — dar zero a diria "péssima", quando o que
        # se sabe é "ainda não olhamos". Ela aparece na lista, marcada, depois
        # das avaliadas: a coordenação precisa justamente ver quem falta.
        avaliado = aprovacao is not None or dados["ncs"] > 0 or penalidade > 0

        indice: Decimal | None = None
        if avaliado:
            bruto = (
                (aprovacao or Decimal(0)) * PESO_APROVACAO
                - Decimal(dados["ncs"]) * DESCONTO_POR_NC
                - Decimal(penalidade) * DESCONTO_POR_PENALIDADE
            )
            indice = max(Decimal(0), bruto).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        placar_final.append(
            LinhaPlacar(
                empresa_id=empresa_id,
                empresa=empresa.nome,
                modelos=dados["modelos"],
                aprovacao_media=aprovacao,
                ncs_abertas=dados["ncs"],
                penalidades=penalidade,
                indice=indice,
                avaliado=avaliado,
            )
        )

    # Avaliadas primeiro, por índice; as não avaliadas no fim, por nome.
    placar_final.sort(
        key=lambda linha: (
            not linha.avaliado,
            -(linha.indice or Decimal(0)),
            linha.empresa,
        )
    )
    return placar_final
