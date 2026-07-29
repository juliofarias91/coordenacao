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


def _banco() -> str:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:  # pragma: no cover - depende de infraestrutura
        return f"erro: {type(exc).__name__}"


def _fila() -> str:
    """O broker do Celery aceita conexão?

    Sem ele a plataforma CONTINUA FUNCIONANDO: o upload é aceito e gravado, e
    só a auditoria automática não é enfileirada. É justamente por continuar
    funcionando que a falta precisa aparecer aqui — senão a única pista de que
    o Redis sumiu é a análise que nunca sai, e isso se descobre tarde.
    """
    try:
        from app.workers.tasks import fila_disponivel
    except Exception as exc:  # pragma: no cover - Celery ausente na imagem
        return f"erro: {type(exc).__name__}"
    return "ok" if fila_disponivel() else "indisponível"


def _storage() -> str:
    """O bucket responde e existe?

    Duas escolhas deliberadas aqui:

    `head_bucket` e não `garantir_bucket` — readiness NÃO CRIA
    INFRAESTRUTURA. Um endpoint que o monitoramento chama a cada 30s não pode
    ter efeito colateral, e um bucket criado a partir de uma configuração
    errada só seria notado quando alguém procurasse os arquivos no lugar certo.

    Socket antes de `head_bucket`, com `cliente_sonda` — o caso caro é
    justamente o do storage fora do ar, e é o que se quer descobrir DEPRESSA.
    Com o cliente normal essa resposta leva ~45s; só com timeout curto, ~8s;
    com a sonda de socket na frente, meio segundo. Num endpoint chamado a cada
    30s pelo monitoramento, a diferença é entre relatar a queda e virar parte
    dela.
    """
    try:
        from botocore.exceptions import ClientError

        from app.services.storage import cliente_sonda, endpoint_alcancavel

        if not endpoint_alcancavel():
            return "inalcançável"
        cliente_sonda().head_bucket(Bucket=settings.s3_bucket)
        return "ok"
    except ClientError as exc:  # pragma: no cover - depende de infraestrutura
        codigo = exc.response.get("Error", {}).get("Code", "?")
        # 404 é "ainda não existe", que é o estado normal antes do primeiro
        # upload — a aplicação o cria ali. Distinguir de credencial errada
        # (403) importa: um é espera, o outro é configuração quebrada.
        if codigo in {"404", "NoSuchBucket"}:
            return "ausente (nasce no primeiro upload)"
        return f"erro: {codigo}"
    except Exception as exc:  # pragma: no cover - depende de infraestrutura
        return f"erro: {type(exc).__name__}"


@router.get("/health/ready")
def ready() -> dict[str, object]:
    """Readiness: o banco responde, e o que mais a plataforma depende.

    RESPONDE 200 MESMO DEGRADADO, de propósito. O `HEALTHCHECK` do container
    aponta para `/health` (liveness); se este devolvesse 5xx, um Redis fora do
    ar derrubaria a API inteira — sendo que sem Redis tudo funciona menos o
    enfileiramento. Quem monitora lê o campo `status`, não o código HTTP.
    """
    componentes = {"banco": _banco(), "fila": _fila(), "storage": _storage()}
    saudavel = all(v == "ok" or v.startswith("ausente") for v in componentes.values())
    return {"status": "ok" if saudavel else "degradado", **componentes}
