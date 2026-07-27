"""Health checks — usados pelo CI, pelo docker e pelo monitoramento (SP-501)."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.core.config import settings
from app.db.session import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness: a aplicação está de pé."""
    return {"status": "ok", "versao": __version__, "ambiente": settings.app_env}


@router.get("/health/ready")
def ready() -> dict[str, object]:
    """Readiness: o banco responde."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        banco = "ok"
    except Exception as exc:  # pragma: no cover - depende de infraestrutura
        banco = f"erro: {type(exc).__name__}"
    return {"status": "ok" if banco == "ok" else "degradado", "banco": banco}
