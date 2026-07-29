"""API: a aplicação sobe, o health responde e rota protegida exige token."""

from __future__ import annotations

import socket
import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import settings


def test_health(client: TestClient) -> None:
    r = client.get(f"{settings.api_prefix}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_readiness_relata_os_tres_componentes(client: TestClient) -> None:
    """Banco, fila e storage — os três de que a plataforma depende.

    Até 29/07/2026 o readiness só olhava o banco, e a falta do Redis não
    aparecia em lugar nenhum: o upload continuava sendo aceito e só a auditoria
    automática nunca saía. Um componente que degrada em silêncio é descoberto
    tarde, e aqui é o lugar de perguntar "está tudo de pé?".
    """
    r = client.get(f"{settings.api_prefix}/health/ready")
    assert r.status_code == 200
    corpo = r.json()
    for componente in ("banco", "fila", "storage"):
        assert componente in corpo, f"o readiness deixou de relatar {componente}"
    assert corpo["status"] in {"ok", "degradado"}


def test_readiness_responde_200_mesmo_degradado(client: TestClient) -> None:
    """Não pode devolver 5xx.

    Na máquina de teste o Redis e o MinIO costumam estar fora, então este teste
    normalmente exercita justamente o caminho degradado. É o comportamento
    desejado: sem fila tudo funciona menos o enfileiramento, e derrubar a API
    por isso trocaria uma degradação por uma queda.
    """
    r = client.get(f"{settings.api_prefix}/health/ready")
    assert r.status_code == 200


def test_sonda_do_storage_desiste_depressa() -> None:
    """A sonda de socket é o que impede o readiness de virar parte da queda.

    Sem ela, `head_bucket` contra um endpoint fora do ar custa ~45s com o
    cliente normal e ~8s mesmo com timeout curto e uma tentativa — o host
    resolve para vários endereços e cada um espera a sua vez. Num endpoint que
    o monitoramento chama a cada 30s, isso empilha requisições penduradas.

    É a mesma armadilha que `fila_disponivel()` já evitava no worker; este
    teste existe para que ninguém a reintroduza trocando a sonda por uma
    chamada S3 "que é mais precisa".
    """
    from app.services import storage

    # Porta 1 em 127.0.0.1: nada escuta ali, e a recusa é local e imediata.
    with patch.object(settings, "s3_endpoint_url", "http://127.0.0.1:1"):
        inicio = time.perf_counter()
        alcancavel = storage.endpoint_alcancavel()
        decorrido = time.perf_counter() - inicio

    assert alcancavel is False
    # Folga larga de propósito: o que se protege é a ordem de grandeza (meio
    # segundo, não dezenas), não o número exato numa máquina carregada.
    assert decorrido < 5, f"a sonda levou {decorrido:.1f}s — o timeout curto se perdeu"


def test_sonda_do_storage_aceita_endpoint_no_ar() -> None:
    """Contraprova: um socket que aceita conexão é relatado como alcançável.

    Sem isto, uma sonda que devolvesse `False` sempre passaria no teste acima e
    faria o readiness anunciar storage fora do ar mesmo com ele de pé.
    """
    from app.services import storage

    with socket.socket() as servidor:
        servidor.bind(("127.0.0.1", 0))
        servidor.listen(1)
        porta = servidor.getsockname()[1]

        with patch.object(settings, "s3_endpoint_url", f"http://127.0.0.1:{porta}"):
            assert storage.endpoint_alcancavel() is True


def test_rota_protegida_sem_token(client: TestClient) -> None:
    r = client.get(f"{settings.api_prefix}/auth/me")
    assert r.status_code == 401


def test_rota_protegida_com_token_invalido(client: TestClient) -> None:
    r = client.get(
        f"{settings.api_prefix}/auth/me",
        headers={"Authorization": "Bearer nao-e-um-jwt"},
    )
    assert r.status_code == 401


def test_openapi_expoe_os_endpoints_da_fase_0(client: TestClient) -> None:
    r = client.get(f"{settings.api_prefix}/openapi.json")
    assert r.status_code == 200
    caminhos = r.json()["paths"]
    for rota in ("/auth/login", "/auth/refresh", "/auth/me", "/health"):
        assert f"{settings.api_prefix}{rota}" in caminhos
