"""SP-207 · Exportação do relatório (PDF) e do controle (Excel).

Nenhum dos dois é armazenado: são gerados na hora a partir das auditorias. É
o que a especificação chama de "documento gerado sob demanda".
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_tenant_db, requer_permissao
from app.models import Modelo
from app.services import exports
from app.services.escopo import exigir, exigir_projeto

router = APIRouter(tags=["exports"])


@router.get(
    "/modelos/{modelo_id}/relatorio.pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def relatorio_pdf(
    modelo_id: uuid.UUID,
    idioma: str = Query(default="pt", pattern=r"^(pt|en)$"),
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("gerar_relatorio")),
) -> Response:
    """Relatório de RNC do último round do modelo, bilíngue."""
    modelo = exigir(db, Modelo, modelo_id, "modelo")
    try:
        pdf = exports.relatorio_pdf(db, modelo_id, idioma=idioma)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    nome = f"RNC_{modelo.codigo}_{datetime.now(UTC):%Y%m%d}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.get(
    "/projetos/{projeto_id}/controle.xlsx",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}
            }
        }
    },
)
def controle_xlsx(
    projeto_id: uuid.UUID,
    db: Session = Depends(get_tenant_db),
    _: CurrentUser = Depends(requer_permissao("gerar_relatorio")),
) -> Response:
    projeto = exigir_projeto(db, projeto_id)
    try:
        xlsx = exports.controle_xlsx(db, projeto_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    nome = f"Controle_{projeto.codigo}_{datetime.now(UTC):%Y%m%d}.xlsx"
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
