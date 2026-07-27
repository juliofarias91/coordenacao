"""SP-302 · Tasks assíncronas.

A regra de ouro aqui: **a task é um invólucro fino**. Toda a lógica mora em
`app/services/automacao/executor.py`, que é uma função comum sobre uma sessão
— por isso os testes a exercitam sem Redis, sem worker e sem eager mode.

CA da SP-302: falha e retry observáveis. Uma exceção esgotada não some no
log: vira `notificacao(tipo='erro')` para a coordenação, porque um round que
simplesmente não avança é indistinguível de um round esquecido.
"""

from __future__ import annotations

import logging
import socket
import uuid
from urllib.parse import urlparse

from sqlalchemy import text

from app.core.config import settings
from app.db.session import session_scope
from app.models import VersaoModelo
from app.services import penalidades as ledger
from app.services.automacao import executar_auditoria_automatica
from app.workers.celery_app import celery

log = logging.getLogger(__name__)


@celery.task(name="spbim.ping")
def ping() -> str:
    """Prova de vida da fila: o worker responde e alcança o banco."""
    with session_scope() as session:
        session.execute(text("SELECT 1"))
    log.info("ping ok")
    return "pong"


@celery.task(
    name="spbim.auditar_versao",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def auditar_versao(self, versao_id: str, org_id: str) -> dict:
    """Roda a auditoria automatizada de uma versão.

    Disparada quando chega arquivo novo (upload manual ou webhook do ACC).
    """
    org = uuid.UUID(org_id)
    versao_uuid = uuid.UUID(versao_id)

    try:
        with session_scope(org) as db:
            versao = db.get(VersaoModelo, versao_uuid)
            if versao is None:
                log.warning("versão %s não encontrada; nada a fazer", versao_id)
                return {"versao_id": versao_id, "ignorado": "versão inexistente"}

            relatorio = executar_auditoria_automatica(db, versao, org_id=org)

            if relatorio.erros:
                ledger.avisar_erro(
                    db,
                    org_id=org,
                    mensagem=(
                        f"Auditoria automática da versão {versao.versao} teve falhas: "
                        + "; ".join(relatorio.erros[:3])
                    ),
                    origem=versao_id,
                )
            else:
                ledger.avisar_auditoria(
                    db,
                    org_id=org,
                    mensagem=f"Auditoria automática concluída: {relatorio.resumo}",
                    origem=versao_id,
                )

            log.info("auditoria automática de %s: %s", versao_id, relatorio.resumo)
            return {
                "versao_id": versao_id,
                "avaliados": relatorio.avaliados,
                "aprovados": relatorio.aprovados,
                "reprovados": relatorio.reprovados,
                "na": relatorio.na,
                "erros": relatorio.erros,
            }
    except Exception as exc:
        # Última tentativa: registra para alguém ver, e só então desiste.
        if self.request.retries >= self.max_retries:
            log.exception("auditoria de %s falhou definitivamente", versao_id)
            try:
                with session_scope(org) as db:
                    ledger.avisar_erro(
                        db,
                        org_id=org,
                        mensagem=(
                            f"Auditoria automática da versão {versao_id} falhou após "
                            f"{self.max_retries} tentativas: {type(exc).__name__}: {exc}"
                        ),
                        origem=versao_id,
                    )
            except Exception:  # pragma: no cover - banco fora do ar
                log.exception("não foi possível registrar a falha da auditoria")
        raise


def fila_disponivel(timeout: float = 0.5) -> bool:
    """O broker está aceitando conexão?

    Um socket cru, e não `delay()`, porque as políticas de reconexão do Celery
    e do backend de resultado levam ~8s para desistir. Meio segundo aqui
    responde a mesma pergunta.
    """
    url = urlparse(settings.celery_broker_url)
    host, porta = url.hostname or "localhost", url.port or 6379
    try:
        with socket.create_connection((host, porta), timeout=timeout):
            return True
    except OSError:
        return False


def enfileirar_auditoria(versao_id: uuid.UUID, org_id: uuid.UUID) -> str | None:
    """Enfileira sem derrubar nem atrasar quem chamou.

    O arquivo já está salvo quando isto roda: broker fora do ar não pode
    transformar um upload bem-sucedido em erro — nem em espera — para o
    fornecedor.
    """
    if not fila_disponivel():
        log.warning("broker indisponível; auditoria de %s não enfileirada", versao_id)
        return None
    try:
        return auditar_versao.delay(str(versao_id), str(org_id)).id
    except Exception as exc:  # noqa: BLE001
        log.warning("auditoria de %s não enfileirada: %s", versao_id, exc)
        return None
