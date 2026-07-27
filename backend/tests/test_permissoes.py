"""Autorização por papel e por permissão fina (plano técnico, seção 5)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.models.enums import PapelUsuario
from tests.conftest import API, Cenario, requer_banco

pytestmark = requer_banco


def test_cliente_nunca_toca_a_api_interna(client: TestClient, cenario: Cenario) -> None:
    """O papel `cliente` só existe para o portal — nem com token válido entra."""
    headers = cenario.headers(papel=PapelUsuario.CLIENTE, permissoes=[])
    for rota in ("/projetos", "/empresas", "/usuarios", "/criterios", "/disciplinas"):
        r = client.get(f"{API}{rota}", headers=headers)
        assert r.status_code == 403, rota
        assert "portal" in r.json()["detail"]


def test_leitura_exige_ver_painel(client: TestClient, cenario: Cenario) -> None:
    headers = cenario.headers(papel=PapelUsuario.LEITOR, permissoes=["ver_relatorios"])
    r = client.get(f"{API}/projetos", headers=headers)
    assert r.status_code == 403
    assert "ver_painel" in r.json()["detail"]


def test_lista_vazia_de_permissoes_usa_o_padrao_do_papel(
    client: TestClient, cenario: Cenario
) -> None:
    """Comportamento declarado no cadastro: sem lista própria, valem as
    permissões padrão do papel — não "nenhuma permissão"."""
    headers = cenario.headers(papel=PapelUsuario.LEITOR, permissoes=[])
    assert client.get(f"{API}/projetos", headers=headers).status_code == 200


def test_escrita_de_cadastro_exige_admin_cadastro(
    client: TestClient, cenario: Cenario
) -> None:
    """Auditor lê o painel mas não mexe no cadastro."""
    headers = cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel", "executar"])

    assert client.get(f"{API}/projetos", headers=headers).status_code == 200

    r = client.post(f"{API}/projetos", json={"codigo": "NOPE", "nome": "x"}, headers=headers)
    assert r.status_code == 403
    assert "admin_cadastro" in r.json()["detail"]


def test_biblioteca_exige_editar_biblioteca(client: TestClient, cenario: Cenario) -> None:
    """Quem administra cadastro não edita critério por tabela — são permissões
    distintas, como no protótipo."""
    headers = cenario.headers(
        papel=PapelUsuario.COORDENADOR, permissoes=["ver_painel", "admin_cadastro"]
    )
    r = client.post(
        f"{API}/criterios",
        json={
            "projeto_id": str(cenario.projeto.id),
            "codigo": "X",
            "nome_pt": "a",
            "nome_en": "b",
            "nivel": "modelo",
            "automacao": "manual",
        },
        headers=headers,
    )
    assert r.status_code == 403
    assert "editar_biblioteca" in r.json()["detail"]


def test_listagem_de_usuarios_e_restrita(client: TestClient, cenario: Cenario) -> None:
    headers = cenario.headers(papel=PapelUsuario.AUDITOR, permissoes=["ver_painel"])
    assert client.get(f"{API}/usuarios", headers=headers).status_code == 403


def test_sem_token_e_401_e_nao_403(client: TestClient) -> None:
    assert client.get(f"{API}/projetos").status_code == 401
