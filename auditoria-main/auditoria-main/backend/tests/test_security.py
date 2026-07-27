"""Senha e JWT — SP-003: senha nunca em texto, rota protegida rejeita sem token."""

from __future__ import annotations

import uuid

import pytest

from app.core.security import (
    TokenError,
    create_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_hash_nao_guarda_a_senha_em_texto() -> None:
    h = hash_password("segredo-do-piloto")
    assert "segredo-do-piloto" not in h
    assert h.startswith("$argon2")


def test_verificacao_de_senha() -> None:
    h = hash_password("segredo-do-piloto")
    assert verify_password("segredo-do-piloto", h)
    assert not verify_password("outra-coisa", h)


def test_senha_nula_nunca_autentica() -> None:
    """Usuário só-SSO tem `senha_hash` nulo e não pode entrar por senha."""
    assert not verify_password("qualquer", None)


def test_hash_do_mesmo_texto_tem_sal_diferente() -> None:
    assert hash_password("igual") != hash_password("igual")


def _token(**kw: object) -> str:
    base: dict = {
        "usuario_id": uuid.uuid4(),
        "org_id": uuid.uuid4(),
        "papel": "auditor",
        "permissoes": ["ver_painel", "executar"],
    }
    base.update(kw)
    return create_token(**base)  # type: ignore[arg-type]


def test_token_carrega_o_tenant() -> None:
    org = uuid.uuid4()
    claims = decode_token(_token(org_id=org))
    assert claims["org"] == str(org)
    assert claims["papel"] == "auditor"
    assert claims["perms"] == ["ver_painel", "executar"]


def test_refresh_nao_serve_como_access() -> None:
    refresh = _token(token_type="refresh")
    with pytest.raises(TokenError):
        decode_token(refresh, expected_type="access")


def test_token_adulterado_e_rejeitado() -> None:
    token = _token()
    corpo = token.split(".")
    corpo[1] = corpo[1][:-4] + "AAAA"
    with pytest.raises(TokenError):
        decode_token(".".join(corpo))
