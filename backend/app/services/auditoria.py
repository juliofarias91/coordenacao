"""Regras de negócio da execução da auditoria.

Este módulo concentra o que a especificação chama de *dado de origem*. Painel,
matriz, relatório e KPIs derivam daqui — nada disso é mantido à mão.

Três regras merecem destaque, porque não são óbvias no schema:

1. **Abrir uma auditoria materializa os resultados.** Ao abrir, cada item do
   checklist vira uma linha `resultado_check` com status `pendente`. Sem isso,
   "quantos itens faltam" seria uma conta entre tabelas diferentes a cada
   consulta, e um item acrescentado ao checklist depois mudaria o resultado de
   um round já fechado.

2. **N/A sai do denominador.** A aprovação é `ok / (analisados − na)`. Um
   critério que não se aplica àquela disciplina não pode contar como falha nem
   inflar o percentual — é o mesmo cálculo do protótipo.

3. **Versão nova desatualiza o round anterior.** Quando chega uma versão nova
   do modelo, as auditorias publicadas das versões anteriores passam a
   `desatualizado`. É o estado que o painel usa para dizer "isto já foi
   aprovado, mas sobre um arquivo que não é mais o vigente".
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Auditoria,
    ChecklistItem,
    Disciplina,
    Modelo,
    ResultadoCheck,
    VersaoModelo,
)
from app.models.enums import AuditoriaEstado, ChecklistTipo, CheckStatus

# OS RECORTES QUE SE AUDITAM POR ÁREA, e não sobre o arquivo inteiro.
#
# Sai do processo real, não de preferência: os controles de LOD da coordenação
# (`Bases/LOD*_SPECIFIC AUDIT_CONTROL.xlsx`) têm UMA ABA POR ÁREA — ADMN,
# COLO1..COLO4, SITE, UTLS, GUAR —, cada uma com o round e o percentual de cada
# modelo dentro dela. Os de geral e 4D não têm: são do arquivo.
#
# O LOD 300 ENTROU EM 05/08/2026, a pedido, e o arquivo confirma: o
# `LOD300_SPECIFIC AUDIT_CONTROL.xlsx` tem SEIS abas de área — ADMN, COLO1,
# COLO2, COLO3, COLO4 e SITE — além do CONTROL e do OVERVIEW. Ele estava fora
# desta lista por leitura do PDF de espec, que é por ELEMENTO e não por área; o
# controle mostra que a coordenação acompanha os três LOD do mesmo jeito.
#
# ISTO NÃO REESCREVE O QUE JÁ EXISTE. As auditorias de LOD 300 abertas antes
# disto têm `area` nula e continuam válidas: a tela cai na de maior round quando
# não há aba nenhuma (ver `usePlanilha`). Quem quiser a divisão por área abre um
# round novo, e é aí que `_areas_do_checklist` passa a criar uma por área.
#
# Esta constante é o que faz a matriz modelo × área ter conteúdo. Ela nasceu
# vazia porque `area` só era gravada quando o chamador a informava, e ninguém
# informava — ver `api/v1/auditorias.py::_areas_do_checklist`.
CHECKLISTS_POR_AREA: frozenset[ChecklistTipo] = frozenset(
    {ChecklistTipo.LOD300, ChecklistTipo.LOD400, ChecklistTipo.LOD500}
)


def checklists_da_versao(db: Session, versao: VersaoModelo) -> list[ChecklistTipo]:
    """Auditorias aplicáveis, definidas na disciplina do modelo (SP-105)."""
    disciplina = db.execute(
        select(Disciplina)
        .join(Modelo, Modelo.disciplina_id == Disciplina.id)
        .where(Modelo.id == versao.modelo_id)
    ).scalar_one_or_none()
    return list(disciplina.checklists) if disciplina else []


def areas_da_versao(db: Session, versao: VersaoModelo) -> list[str]:
    disciplina = db.execute(
        select(Disciplina)
        .join(Modelo, Modelo.disciplina_id == Disciplina.id)
        .where(Modelo.id == versao.modelo_id)
    ).scalar_one_or_none()
    return list(disciplina.areas) if disciplina else []


def proximo_round(db: Session, modelo_id: uuid.UUID, checklist: ChecklistTipo) -> int:
    """Rounds são contados por modelo × checklist, não por versão.

    O round é a rodada de conversa com o fornecedor: V1 reprovada, V2
    corrigida e V3 aprovada são os rounds 1, 2 e 3 do mesmo checklist.
    """
    maior = db.execute(
        select(func.max(Auditoria.round))
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .where(VersaoModelo.modelo_id == modelo_id, Auditoria.checklist == checklist)
    ).scalar()
    return (maior or 0) + 1


def abrir_auditoria(
    db: Session,
    *,
    org_id: uuid.UUID,
    versao: VersaoModelo,
    checklist: ChecklistTipo,
    area: str | None = None,
    auditor_id: uuid.UUID | None = None,
) -> Auditoria:
    """Abre a auditoria e materializa um resultado por item do checklist.

    Idempotente: chamar de novo para a mesma (versão, checklist, área)
    devolve a auditoria existente em vez de duplicar o round.
    """
    existente = db.execute(
        select(Auditoria).where(
            Auditoria.versao_id == versao.id,
            Auditoria.checklist == checklist,
            Auditoria.area.is_(None) if area is None else Auditoria.area == area,
        )
    ).scalar_one_or_none()
    if existente is not None:
        return existente

    modelo = db.get(Modelo, versao.modelo_id)
    projeto_id = modelo.projeto_id if modelo else None

    auditoria = Auditoria(
        org_id=org_id,
        versao_id=versao.id,
        checklist=checklist,
        area=area,
        round=proximo_round(db, versao.modelo_id, checklist),
        estado=AuditoriaEstado.NAO_PUBLICADO,
        auditor_id=auditor_id,
        data_inicio=datetime.now(UTC),
    )
    db.add(auditoria)
    db.flush()

    itens = db.execute(
        select(ChecklistItem)
        .where(ChecklistItem.projeto_id == projeto_id, ChecklistItem.checklist == checklist)
        .order_by(ChecklistItem.ordem.nulls_last(), ChecklistItem.created_at)
    ).scalars()

    for item in itens:
        db.add(
            ResultadoCheck(
                org_id=org_id,
                auditoria_id=auditoria.id,
                criterio_id=item.criterio_id,
                status=CheckStatus.PENDENTE,
            )
        )
    db.flush()

    recalcular_aprovacao(db, auditoria)
    return auditoria


def recalcular_aprovacao(db: Session, auditoria: Auditoria) -> Decimal | None:
    """`aprovado / (total − na)`, em porcentagem.

    Devolve None quando todos os itens são N/A ou não há item: nesse caso não
    existe percentual a mostrar, e 0% mentiria.
    """
    # A sessão roda com autoflush desligado, e quem chama aqui acabou de mexer
    # num status. Sem este flush a consulta abaixo leria o valor anterior e o
    # percentual sairia sempre um passo atrás.
    db.flush()

    linhas = db.execute(
        select(ResultadoCheck.status).where(ResultadoCheck.auditoria_id == auditoria.id)
    ).scalars()
    considerados = [s for s in linhas if s != CheckStatus.NA]
    if not considerados:
        auditoria.aprovacao_pct = None
        db.flush()
        return None

    aprovados = sum(1 for s in considerados if s == CheckStatus.APROVADO)
    pct = (Decimal(aprovados) / Decimal(len(considerados)) * 100).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    auditoria.aprovacao_pct = pct
    db.flush()
    return pct


def publicar(db: Session, auditoria: Auditoria, revisor_id: uuid.UUID) -> Auditoria:
    """Fecha o round. O revisor é registrado — é a trilha de quem assinou."""
    recalcular_aprovacao(db, auditoria)
    auditoria.estado = AuditoriaEstado.PUBLICADO
    auditoria.revisado_por = revisor_id
    auditoria.publicado_em = datetime.now(UTC)
    auditoria.data_fim = auditoria.data_fim or datetime.now(UTC)
    db.flush()
    return auditoria


def itens_pendentes(db: Session, auditoria: Auditoria) -> int:
    return (
        db.execute(
            select(func.count())
            .select_from(ResultadoCheck)
            .where(
                ResultadoCheck.auditoria_id == auditoria.id,
                ResultadoCheck.status == CheckStatus.PENDENTE,
            )
        ).scalar_one()
        or 0
    )


def marcar_versoes_anteriores_como_desatualizadas(
    db: Session, nova_versao: VersaoModelo
) -> int:
    """Chamado quando entra versão nova. Devolve quantas auditorias mudaram.

    Só mexe no que estava `publicado`: um round ainda em andamento continua em
    andamento — quem decide abandoná-lo é a coordenação, não o upload.
    """
    alvos = db.execute(
        select(Auditoria)
        .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
        .where(
            VersaoModelo.modelo_id == nova_versao.modelo_id,
            VersaoModelo.id != nova_versao.id,
            Auditoria.estado == AuditoriaEstado.PUBLICADO,
        )
    ).scalars()

    mudadas = 0
    for auditoria in alvos:
        auditoria.estado = AuditoriaEstado.DESATUALIZADO
        mudadas += 1
    db.flush()
    return mudadas


def ao_registrar_versao(
    db: Session,
    *,
    org_id: uuid.UUID,
    versao: VersaoModelo,
    auditor_id: uuid.UUID | None = None,
) -> Auditoria | None:
    """Tudo o que acontece porque uma versão passou a existir.

    DUAS ROTAS CRIAM VERSÃO — `POST /modelos/{id}/versoes` e o webhook do ACC
    — e as duas precisam produzir o mesmo estado. Deixar a lista de efeitos nos
    handlers já custou uma divergência silenciosa: o cabeçalho de `api/v1/
    modelos.py` avisa que o efeito colateral deve morar no serviço justamente
    porque a versão manual "cria versão equivalente ao fluxo do ACC", e um
    efeito acrescentado em um dos dois lados quebra essa equivalência sem que
    nada acuse.

    Os efeitos, em ordem — e a ordem é o ponto:

    1. Invalidar os rounds publicados das versões anteriores.
    2. Abrir a auditoria GERAL, se a disciplina do modelo a declara.

    Invalidar ANTES de abrir não é estilo: `abrir_auditoria` chama
    `proximo_round`, que conta os rounds do modelo. Trocar a ordem não muda a
    contagem hoje — nenhum dos dois passos cria round — mas deixa o segundo
    lendo um estado que o primeiro ainda vai alterar, e é o tipo de acoplamento
    que sobrevive até alguém mexer nele.

    Devolve a auditoria geral aberta, ou `None` quando a disciplina não pede
    geral (ou o modelo não tem disciplina).
    """
    marcar_versoes_anteriores_como_desatualizadas(db, versao)

    if ChecklistTipo.GERAL not in checklists_da_versao(db, versao):
        return None
    return abrir_auditoria(
        db,
        org_id=org_id,
        versao=versao,
        checklist=ChecklistTipo.GERAL,
        auditor_id=auditor_id,
    )
