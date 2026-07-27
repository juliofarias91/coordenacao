"""Views derivadas — SP-206.

O painel de controle e a matriz disciplina × área **não são tabelas**. São
consultas sobre `auditoria`/`resultado_check`. É literalmente isso que
substitui as planilhas de controle mantidas à mão: não existe onde digitar
esses números.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Auditoria, Disciplina, Empresa, Modelo, NaoConformidade, VersaoModelo
from app.models.enums import AuditoriaEstado, ChecklistTipo


@dataclass
class ResumoChecklist:
    """Uma auditoria da versão vigente, resumida para a linha do painel."""

    checklist: str
    auditoria_id: uuid.UUID
    estado: str
    aprovacao_pct: Decimal | None
    round: int | None


@dataclass
class LinhaPainel:
    modelo_id: uuid.UUID
    codigo: str
    disciplina_codigo: str | None
    macro: str | None
    cor_macro: str | None
    instaladora: str | None
    modeladora: str | None
    versao: str | None
    versao_id: uuid.UUID | None
    formato: str | None
    round: int | None
    estado: str | None
    aprovacao_pct: Decimal | None
    publicado_em: datetime | None
    ncs_abertas: int = 0
    checklists: list[ResumoChecklist] = field(default_factory=list)


@dataclass
class Matriz:
    areas: list[str] = field(default_factory=list)
    linhas: list[dict] = field(default_factory=list)


# Cores de identidade da macrodisciplina. O teal do MEP subiu de #0E7C6B para
# #0A8A72: no valor original a saturação ficava abaixo do piso e a barra lia
# como cinza — o tom é o mesmo, só deixou de desaparecer.
CORES_MACRO = {"A": "#2547B0", "C": "#A85B12", "M": "#0A8A72", "S": "#6A3DAE"}


def _ultima_versao_por_modelo(db: Session, projeto_id: uuid.UUID) -> dict[uuid.UUID, VersaoModelo]:
    """A versão vigente é a mais recente por data de criação.

    Não dá para ordenar pelo rótulo: 'V10' < 'V2' em ordem alfabética, e o
    fornecedor às vezes pula números.

    O `id` desempata porque `now()` no Postgres é o instante da **transação**,
    não do INSERT: duas versões gravadas juntas ficam com `created_at`
    idêntico, e sem critério de desempate a versão vigente mudaria de uma
    consulta para a outra.
    """
    versoes = db.execute(
        select(VersaoModelo)
        .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
        .where(Modelo.projeto_id == projeto_id)
        .order_by(
            VersaoModelo.modelo_id,
            VersaoModelo.created_at.desc(),
            VersaoModelo.id.desc(),
        )
    ).scalars()

    ultimas: dict[uuid.UUID, VersaoModelo] = {}
    for v in versoes:
        ultimas.setdefault(v.modelo_id, v)
    return ultimas


def painel_de_controle(
    db: Session, projeto_id: uuid.UUID, *, checklist: ChecklistTipo | None = None
) -> list[LinhaPainel]:
    """Uma linha por modelo, com o estado do round mais recente.

    Substitui a aba GENERAL AUDIT - CONTROL da planilha.
    """
    modelos = list(
        db.execute(
            select(Modelo).where(Modelo.projeto_id == projeto_id).order_by(Modelo.codigo)
        ).scalars()
    )
    if not modelos:
        return []

    ultimas = _ultima_versao_por_modelo(db, projeto_id)

    disciplinas = {
        d.id: d
        for d in db.execute(
            select(Disciplina).where(Disciplina.projeto_id == projeto_id)
        ).scalars()
    }
    empresas = {e.id: e.nome for e in db.execute(select(Empresa)).scalars()}

    # TODAS as auditorias da versão vigente — um modelo costuma ter mais de um
    # checklist (Geral + IFC, por exemplo), e a linha do painel responde "este
    # modelo está aprovado?", que só faz sentido olhando o conjunto.
    stmt_aud = select(Auditoria).where(
        Auditoria.versao_id.in_([v.id for v in ultimas.values()] or [uuid.uuid4()])
    )
    if checklist is not None:
        stmt_aud = stmt_aud.where(Auditoria.checklist == checklist)
    stmt_aud = stmt_aud.order_by(Auditoria.checklist, Auditoria.round.desc().nulls_last())

    por_versao: dict[uuid.UUID, list[Auditoria]] = {}
    vistos: set[tuple[uuid.UUID, str, str | None]] = set()
    for a in db.execute(stmt_aud).scalars():
        # Só o round mais alto de cada (versão, checklist, área).
        chave = (a.versao_id, a.checklist.value, a.area)
        if chave in vistos:
            continue
        vistos.add(chave)
        por_versao.setdefault(a.versao_id, []).append(a)

    ncs = {
        versao_id: total
        for versao_id, total in db.execute(
            select(Auditoria.versao_id, func.count(NaoConformidade.id))
            .join(NaoConformidade, NaoConformidade.auditoria_id == Auditoria.id)
            .join(VersaoModelo, VersaoModelo.id == Auditoria.versao_id)
            .join(Modelo, Modelo.id == VersaoModelo.modelo_id)
            .where(Modelo.projeto_id == projeto_id, NaoConformidade.status != "resolvido")
            .group_by(Auditoria.versao_id)
        ).all()
    }

    linhas: list[LinhaPainel] = []
    for modelo in modelos:
        versao = ultimas.get(modelo.id)
        auditorias = por_versao.get(versao.id, []) if versao else []
        disciplina = disciplinas.get(modelo.disciplina_id) if modelo.disciplina_id else None

        estado, aprovacao, publicado_em = _consolidar(auditorias)

        linhas.append(
            LinhaPainel(
                modelo_id=modelo.id,
                codigo=modelo.codigo,
                disciplina_codigo=disciplina.codigo if disciplina else None,
                macro=disciplina.macro.value if disciplina else None,
                cor_macro=CORES_MACRO.get(disciplina.macro.value) if disciplina else None,
                instaladora=empresas.get(modelo.instaladora_id) if modelo.instaladora_id else None,
                modeladora=empresas.get(modelo.modeladora_id) if modelo.modeladora_id else None,
                versao=versao.versao if versao else None,
                versao_id=versao.id if versao else None,
                formato=versao.formato.value if versao else None,
                round=max((a.round for a in auditorias if a.round), default=None),
                estado=estado,
                aprovacao_pct=aprovacao,
                publicado_em=publicado_em,
                ncs_abertas=ncs.get(versao.id, 0) if versao else 0,
                checklists=[
                    ResumoChecklist(
                        checklist=a.checklist.value,
                        auditoria_id=a.id,
                        estado=a.estado.value,
                        aprovacao_pct=a.aprovacao_pct,
                        round=a.round,
                    )
                    for a in auditorias
                ],
            )
        )
    return linhas


def _consolidar(
    auditorias: list[Auditoria],
) -> tuple[str, Decimal | None, datetime | None]:
    """Reduz as auditorias da versão vigente a uma linha do painel.

    - **Estado**: o modelo só conta como publicado quando *todas* as suas
      auditorias estão publicadas. Basta uma desatualizada para a linha
      inteira ficar desatualizada — o painel existe para avisar disso.
    - **Aprovação**: média simples das auditorias que têm percentual. As que
      são todas N/A não entram, pelo mesmo motivo pelo qual N/A sai do
      denominador dentro de uma auditoria.
    """
    if not auditorias:
        # O modelo existe, mas ninguém ainda olhou para ele.
        return AuditoriaEstado.NAO_PUBLICADO.value, None, None

    estados = {a.estado for a in auditorias}
    if AuditoriaEstado.DESATUALIZADO in estados:
        estado = AuditoriaEstado.DESATUALIZADO.value
    elif estados == {AuditoriaEstado.PUBLICADO}:
        estado = AuditoriaEstado.PUBLICADO.value
    else:
        estado = AuditoriaEstado.NAO_PUBLICADO.value

    pcts = [a.aprovacao_pct for a in auditorias if a.aprovacao_pct is not None]
    aprovacao = (
        (sum(pcts) / Decimal(len(pcts))).quantize(Decimal("0.01")) if pcts else None
    )

    publicados = [a.publicado_em for a in auditorias if a.publicado_em is not None]
    return estado, aprovacao, max(publicados) if publicados else None


def matriz_por_area(
    db: Session, projeto_id: uuid.UUID, *, checklist: ChecklistTipo = ChecklistTipo.LOD500
) -> Matriz:
    """Pivô modelo × área — substitui a aba LOD 500 - OVERVIEW.

    Célula vazia = área não auditada; área fora do escopo da disciplina nem
    aparece na linha.
    """
    disciplinas = {
        d.id: d
        for d in db.execute(
            select(Disciplina).where(Disciplina.projeto_id == projeto_id)
        ).scalars()
    }

    areas: list[str] = []
    for d in disciplinas.values():
        for a in d.areas:
            if a not in areas:
                areas.append(a)
    areas.sort()

    modelos = list(
        db.execute(
            select(Modelo).where(Modelo.projeto_id == projeto_id).order_by(Modelo.codigo)
        ).scalars()
    )
    ultimas = _ultima_versao_por_modelo(db, projeto_id)

    # (versao_id, area) -> auditoria de maior round
    auditorias = db.execute(
        select(Auditoria)
        .where(
            Auditoria.versao_id.in_([v.id for v in ultimas.values()] or [uuid.uuid4()]),
            Auditoria.checklist == checklist,
        )
        .order_by(Auditoria.round.desc().nulls_last())
    ).scalars()

    por_chave: dict[tuple[uuid.UUID, str | None], Auditoria] = {}
    for a in auditorias:
        por_chave.setdefault((a.versao_id, a.area), a)

    linhas: list[dict] = []
    for modelo in modelos:
        disciplina = disciplinas.get(modelo.disciplina_id) if modelo.disciplina_id else None
        if disciplina is None or checklist not in disciplina.checklists:
            continue

        versao = ultimas.get(modelo.id)
        celulas: dict[str, dict | None] = {}
        for area in areas:
            if area not in disciplina.areas:
                celulas[area] = None  # N/A — fora do escopo desta disciplina
                continue
            auditoria = por_chave.get((versao.id, area)) if versao else None
            celulas[area] = (
                {
                    "auditoria_id": str(auditoria.id),
                    "aprovacao_pct": float(auditoria.aprovacao_pct)
                    if auditoria.aprovacao_pct is not None
                    else None,
                    "estado": auditoria.estado.value,
                    "round": auditoria.round,
                }
                if auditoria
                else {"auditoria_id": None, "aprovacao_pct": None, "estado": None, "round": None}
            )

        linhas.append(
            {
                "modelo_id": str(modelo.id),
                "codigo": modelo.codigo,
                "disciplina_codigo": disciplina.codigo,
                "macro": disciplina.macro.value,
                "cor_macro": CORES_MACRO.get(disciplina.macro.value),
                "versao": versao.versao if versao else None,
                "celulas": celulas,
            }
        )

    return Matriz(areas=areas, linhas=linhas)
