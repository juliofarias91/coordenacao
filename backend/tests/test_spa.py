"""A API servindo a aplicação React — o modo container único.

O que se testa aqui não é o React: é a convivência entre a rota curinga da
SPA e as rotas da API. Errar essa convivência dá um sintoma confuso — o
cliente HTTP recebe HTML onde esperava JSON e o erro aparece como
"unexpected token <".
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import spa

PREFIXO = "/api/v1"


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """Um `dist/` do Vite em miniatura."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(
        "<!doctype html><html><body>SPBIM</body></html>", encoding="utf-8"
    )
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    return tmp_path


@pytest.fixture
def cliente(dist: Path) -> TestClient:
    app = FastAPI()

    @app.get(f"{PREFIXO}/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    assert spa.montar(app, prefixo_api=PREFIXO, diretorio=dist) is True
    return TestClient(app)


def test_sem_dist_a_spa_nao_e_montada(tmp_path: Path) -> None:
    """É o caso do desenvolvimento: o Vite serve a aplicação, a API só a API."""
    app = FastAPI()
    assert spa.montar(app, prefixo_api=PREFIXO, diretorio=tmp_path / "nao-existe") is False


def test_raiz_devolve_a_aplicacao(cliente: TestClient) -> None:
    r = cliente.get("/")
    assert r.status_code == 200
    assert "SPBIM" in r.text


@pytest.mark.parametrize(
    "rota",
    [
        "/painel",
        "/kpis",
        "/configuracao",
        "/modelos/3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        # A que mais importa: é o link que o cliente recebe por e-mail, e
        # pedi-la direto no navegador precisa devolver a aplicação.
        "/portal/KjVZcvqq-hZq3W5x3L9tB-ekX-TMiDgALAI4Z0TGS3w",
    ],
)
def test_rotas_da_spa_devolvem_o_index(cliente: TestClient, rota: str) -> None:
    r = cliente.get(rota)
    assert r.status_code == 200
    assert "SPBIM" in r.text


def test_a_api_continua_respondendo(cliente: TestClient) -> None:
    """A curinga da SPA não pode engolir as rotas da API."""
    r = cliente.get(f"{PREFIXO}/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_rota_de_api_inexistente_devolve_json(cliente: TestClient) -> None:
    """Devolver o index.html aqui faria o cliente receber HTML onde esperava
    JSON — e o erro apareceria como "unexpected token <", que não diz nada."""
    r = cliente.get(f"{PREFIXO}/rota-que-nao-existe")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")
    assert json.loads(r.text)["detail"]


def test_arquivo_real_e_servido(cliente: TestClient) -> None:
    r = cliente.get("/favicon.svg")
    assert r.status_code == 200
    assert "<svg" in r.text


def test_asset_com_hash_e_servido(cliente: TestClient) -> None:
    r = cliente.get("/assets/index-abc123.js")
    assert r.status_code == 200
    assert "console.log" in r.text


@pytest.mark.parametrize(
    "caminho",
    [
        "/../pyproject.toml",
        "/..%2Fpyproject.toml",
        "/assets/../../pyproject.toml",
    ],
)
def test_nao_serve_arquivo_fora_do_diretorio(cliente: TestClient, caminho: str) -> None:
    """Travessia de caminho: o pior seria devolver um arquivo do servidor."""
    r = cliente.get(caminho)
    # Ou devolve a aplicação (o fallback), ou recusa. O que não pode é
    # entregar o conteúdo de um arquivo de fora.
    assert "spbim-auditoria-api" not in r.text
    assert "[project]" not in r.text
