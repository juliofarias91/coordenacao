"""SP-402/403 · KPIs do projeto e placar de conformidade."""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.services import kpis as servico
from app.services.escopo import exigir_projeto_do_usuario

router = APIRouter(tags=["kpis"])


class FatiaOut(BaseModel):
    rotulo: str
    valor: float
    cor: str | None = None
    chave: str | None = None


class PontoEvolucaoOut(BaseModel):
    round: int
    aprovacao_media: float | None
    auditorias: int


class KPIsOut(BaseModel):
    projeto_id: uuid.UUID
    modelos: int
    versoes: int
    auditorias_publicadas: int
    aprovacao_media: Decimal | None
    ncs_abertas: int
    ncs_resolvidas: int
    por_macro: list[FatiaOut]
    por_estado: list[FatiaOut]
    por_status_de_item: list[FatiaOut]
    evolucao: list[PontoEvolucaoOut]
    criterios_mais_reprovados: list[FatiaOut]


class LinhaPlacarOut(BaseModel):
    empresa_id: uuid.UUID
    empresa: str
    modelos: int
    aprovacao_media: Decimal | None
    ncs_abertas: int
    penalidades: int
    # Nulo quando `avaliado` é falso: a empresa tem modelo cadastrado e nenhum
    # round. Zero diria "péssima", que não é a mesma coisa.
    indice: Decimal | None
    avaliado: bool


class PlacarOut(BaseModel):
    projeto_id: uuid.UUID
    linhas: list[LinhaPlacarOut]
    # Os pesos vão junto para o placar poder ser contestado com dado.
    formula: str


@router.get("/projetos/{projeto_id}/kpis", response_model=KPIsOut)
def kpis(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> KPIsOut:
    exigir_projeto_do_usuario(db, projeto_id, user)
    dados = servico.calcular(db, projeto_id)
    return KPIsOut(
        **{k: v for k, v in vars(dados).items() if not isinstance(v, list)},
        por_macro=[FatiaOut(**vars(f)) for f in dados.por_macro],
        por_estado=[FatiaOut(**vars(f)) for f in dados.por_estado],
        por_status_de_item=[FatiaOut(**vars(f)) for f in dados.por_status_de_item],
        evolucao=[PontoEvolucaoOut(**vars(p)) for p in dados.evolucao],
        criterios_mais_reprovados=[
            FatiaOut(**vars(f)) for f in dados.criterios_mais_reprovados
        ],
    )


@router.get("/projetos/{projeto_id}/scorecard", response_model=PlacarOut)
def scorecard(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    user: CurrentUser = Depends(requer_permissao("ver_painel")),
) -> PlacarOut:
    """Placar de conformidade por fornecedor, do melhor para o pior."""
    exigir_projeto_do_usuario(db, projeto_id, user)
    linhas = servico.placar(db, projeto_id)
    return PlacarOut(
        projeto_id=projeto_id,
        linhas=[LinhaPlacarOut(**vars(linha)) for linha in linhas],
        formula=(
            f"índice = aprovação média × {servico.PESO_APROVACAO} "
            f"− NCs abertas × {servico.DESCONTO_POR_NC} "
            f"− penalidades × {servico.DESCONTO_POR_PENALIDADE} (piso zero)"
        ),
    )
