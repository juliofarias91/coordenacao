"""Celery — fila das auditorias automatizadas e da ingestão (SP-302).

A partir da Fase 2 a publicação de uma versão enfileira um job aqui; na Fase 3
é este worker que roda o IfcOpenShell na auditoria 4D.
"""

from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery = Celery(
    "spbim",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Sao_Paulo",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,               # job perdido em queda de worker volta para a fila
    worker_prefetch_multiplier=1,      # jobs de auditoria são longos e desiguais
    task_default_retry_delay=30,
    task_max_retries=3,
    # --- broker fora do ar falha rápido -----------------------------------
    # Quem chama `delay()` é o handler do upload, com o fornecedor esperando
    # do outro lado. Com os padrões do Celery, um Redis inacessível prenderia
    # a requisição por dezenas de segundos tentando reconectar. Aqui ele
    # estoura em ~2s, o chamador captura e a resposta diz que a análise não
    # foi enfileirada — o arquivo já está salvo, e reenfileirar é barato.
    broker_connection_retry_on_startup=False,
    # Cuidado: no Celery, `0` aqui significa "tentar para sempre", não "não
    # tentar". Precisa ser um inteiro positivo pequeno.
    broker_connection_max_retries=1,
    broker_connection_timeout=2,
    task_publish_retry=False,
    broker_transport_options={
        "socket_connect_timeout": 2,
        "socket_timeout": 2,
        "max_retries": 1,
    },
    redis_socket_connect_timeout=2,
    redis_socket_timeout=2,
    # O backend de resultado tem a sua própria política de reconexão — 20
    # tentativas com backoff, ~107s no total. Ele é consultado já no
    # `delay()`, então sem isto o broker rápido não adianta nada.
    result_backend_always_retry=False,
    result_backend_transport_options={"retry_policy": {"timeout": 2.0}},
)
