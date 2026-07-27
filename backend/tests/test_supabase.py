"""Comportamento que muda quando o banco está atrás de um pooler.

Não precisa de Supabase para rodar: o que se testa é a decisão que a
configuração toma a partir da URL. O erro que isso previne — "prepared
statement não existe" — só aparece sob carga, em produção, de forma
intermitente. É o tipo de bug que não se descobre testando depois.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.db.session import _connect_args


def _cfg(**kw) -> Settings:
    return Settings(**kw)


@pytest.mark.parametrize(
    "url",
    [
        # Supavisor do Supabase, modo transação.
        "postgresql+psycopg://u:s@aws-1-us-west-2.pooler.supabase.com:6543/postgres",
        # Mesmo host, porta explícita de transação.
        "postgresql+psycopg://u:s@qualquer.host:6543/db",
        # PgBouncer na porta convencional.
        "postgresql+psycopg://u:s@pgbouncer.interno:6432/db",
    ],
)
def test_detecta_pooler_de_transacao(url: str) -> None:
    assert _cfg(app_database_url=url).usa_pooler_de_transacao is True


@pytest.mark.parametrize(
    "url",
    [
        # Conexão direta ao Supabase (porta de sessão).
        "postgresql+psycopg://u:s@db.pilyrmvxytuwoiwjxgdv.supabase.co:5432/postgres",
        # Postgres local do docker-compose.
        "postgresql+psycopg://u:s@db:5432/spbim_auditoria",
    ],
)
def test_conexao_direta_nao_e_pooler(url: str) -> None:
    assert _cfg(app_database_url=url).usa_pooler_de_transacao is False


def test_sobrescrita_explicita_vence_a_deteccao() -> None:
    """Nem todo pooler se anuncia na URL — um proxy interno na 5432, por
    exemplo. A variável existe para esse caso."""
    direto = "postgresql+psycopg://u:s@proxy.interno:5432/db"
    assert _cfg(app_database_url=direto).usa_pooler_de_transacao is False
    assert (
        _cfg(app_database_url=direto, db_pooler_transacao=True).usa_pooler_de_transacao
        is True
    )
    pooler = "postgresql+psycopg://u:s@x.pooler.supabase.com:6543/postgres"
    assert (
        _cfg(app_database_url=pooler, db_pooler_transacao=False).usa_pooler_de_transacao
        is False
    )


def test_prepared_statements_desligam_no_pooler(monkeypatch: pytest.MonkeyPatch) -> None:
    """A consequência prática da detecção."""
    from app.core import config as modulo_config
    from app.db import session as modulo_session

    monkeypatch.setattr(
        modulo_session.settings,
        "app_database_url",
        "postgresql+psycopg://u:s@aws-1-us-west-2.pooler.supabase.com:6543/postgres",
    )
    monkeypatch.setattr(modulo_session.settings, "db_pooler_transacao", None)
    assert _connect_args() == {"prepare_threshold": None}

    monkeypatch.setattr(
        modulo_session.settings,
        "app_database_url",
        "postgresql+psycopg://u:s@db:5432/spbim_auditoria",
    )
    assert _connect_args() == {}
    assert modulo_config  # o import acima documenta de onde vem a configuração


def test_app_database_url_tem_precedencia() -> None:
    """No Supabase, a API usa o pooler e as migrations a conexão direta: são
    URLs diferentes, com host e porta diferentes, e não dá para derivá-las das
    mesmas partes."""
    cfg = _cfg(
        app_database_url="postgresql+psycopg://app:s@pooler:6543/postgres",
        database_url="postgresql+psycopg://postgres:s@direto:5432/postgres",
    )
    assert "pooler:6543" in cfg.sqlalchemy_url
    assert "direto:5432" in cfg.owner_url
    assert cfg.alembic_url == cfg.owner_url, "a migration nunca passa pelo pooler"
