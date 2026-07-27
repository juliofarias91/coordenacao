"""Configuração de log.

Em desenvolvimento, linha legível. Em produção, **JSON numa linha por
evento** — é o formato que qualquer agregador (CloudWatch, Loki, Datadog)
consegue indexar sem regex frágil, e o piloto vai precisar responder
"por que a auditoria da versão X não rodou?" olhando log, não adivinhando.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime

from app.core.config import settings

# Campos que o `LogRecord` já traz e não repetimos no payload.
_PADRAO = {
    "args", "created", "exc_info", "exc_text", "filename", "funcName",
    "levelname", "levelno", "lineno", "module", "msecs", "message",
    "msg", "name", "pathname", "process", "processName", "relativeCreated",
    "stack_info", "thread", "threadName", "taskName",
}


class FormatadorJSON(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        evento = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "nivel": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            evento["excecao"] = self.formatException(record.exc_info)

        # Qualquer `extra={...}` passado no log entra no evento — é assim que
        # se correlaciona um round, uma versão ou um tenant.
        for chave, valor in record.__dict__.items():
            if chave not in _PADRAO and not chave.startswith("_"):
                evento[chave] = valor if isinstance(valor, str | int | float | bool) else str(valor)

        return json.dumps(evento, ensure_ascii=False)


def configurar_logging() -> None:
    raiz = logging.getLogger()
    raiz.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    if settings.is_prod:
        handler.setFormatter(FormatadorJSON())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-5s [%(name)s] %(message)s")
        )

    raiz.addHandler(handler)
    raiz.setLevel(logging.DEBUG if settings.app_debug else logging.INFO)

    # O uvicorn instala os próprios handlers; sem isto cada requisição sai
    # duas vezes, uma em cada formato.
    for nome in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        log = logging.getLogger(nome)
        log.handlers.clear()
        log.propagate = True
