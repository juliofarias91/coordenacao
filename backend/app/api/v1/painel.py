"""SP-206 · Painel de controle e matriz por área.

CA: painel e matriz saem de consulta às auditorias — não existe tabela de
controle própria, e por isso não existe onde digitar esses números.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models.enums import ChecklistTipo
from app.services import painel as servico
from app.services.escopo import exigir_projeto_do_usuario

router = APIRouter(tags=["painel"])


class ResumoChecklistOut(BaseModel):
    checklist: str
    auditoria_id: uuid.UUID
    estado: str
    aprovacao_pct: Decimal | None
    round: int | None


class LinhaPainelOut(BaseModel):
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
    ncs_abertas: int
    checklists: list[ResumoChecklistOut]


class ResumoPainel(BaseModel):
    total_modelos: int
    publicados: int
    desatualizados: int
    nao_publicados: int
    aprovacao_media: float | None
    ncs_abertas: int


class PainelOut(BaseModel):
    projeto_id: uuid.UUID
    resumo: ResumoPainel
    linhas: list[LinhaPainelOut]


class MatrizOut(BaseModel):
    projeto_id: uuid.UUID
    checklist: ChecklistTipo
    areas: list[str]
    linhas: list[dict]


@router.get("/projetos/{projeto_id}/painel", response_model=PainelOut)
def painel(
    projeto_id: uuid.UUID,
    checklist: ChecklistTipo | None = Query(
        default=None, description="Restringe a um tipo de auditoria."
    ),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> PainelOut:
    exigir_projeto_do_usuario(db, projeto_id, user)
    linhas = servico.painel_de_controle(db, projeto_id, checklist=checklist)

    percentuais = [x.aprovacao_pct for x in linhas if x.aprovacao_pct is not None]
    resumo = ResumoPainel(
        total_modelos=len(linhas),
        publicados=sum(1 for x in linhas if x.estado == "publicado"),
        desatualizados=sum(1 for x in linhas if x.estado == "desatualizado"),
        nao_publicados=sum(1 for x in linhas if x.estado == "nao_publicado"),
        aprovacao_media=(
            round(float(sum(percentuais)) / len(percentuais), 2) if percentuais else None
        ),
        ncs_abertas=sum(x.ncs_abertas for x in linhas),
    )
    return PainelOut(
        projeto_id=projeto_id,
        resumo=resumo,
        linhas=[
            LinhaPainelOut(
                **{k: v for k, v in vars(x).items() if k != "checklists"},
                checklists=[ResumoChecklistOut(**vars(c)) for c in x.checklists],
            )
            for x in linhas
        ],
    )


@router.get("/projetos/{projeto_id}/matriz", response_model=MatrizOut)
def matriz(
    projeto_id: uuid.UUID,
    checklist: ChecklistTipo = Query(default=ChecklistTipo.LOD500),
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> MatrizOut:
    """Pivô modelo × área. O escopo de cada linha vem das áreas da disciplina."""
    exigir_projeto_do_usuario(db, projeto_id, user)
    m = servico.matriz_por_area(db, projeto_id, checklist=checklist)
    return MatrizOut(projeto_id=projeto_id, checklist=checklist, areas=m.areas, linhas=m.linhas)
