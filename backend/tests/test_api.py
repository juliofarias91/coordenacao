"""API: a aplicação sobe, o health responde e rota protegida exige token."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings


def test_health(client: TestClient) -> None:
    r = client.get(f"{settings.api_prefix}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


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
