"""Engine, sessão e o ponto onde o tenant entra na conexão.

Toda sessão usada por uma requisição autenticada passa por
`set_tenant(session, org_id)`, que grava o `org_id` num parâmetro de sessão do
Postgres. As policies de row-level security criadas na migration 0001 leem
esse parâmetro — é a camada de isolamento que vale mesmo se alguém esquecer o
filtro no query builder.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _connect_args() -> dict:
    """Ajustes de driver que dependem de onde o banco está.

    Num pooler em modo transação (Supavisor do Supabase, PgBouncer), a conexão
    física muda de uma execução para a outra. O psycopg3 prepara statements a
    partir da 5ª execução da mesma query, e o statement preparado não existe
    na conexão seguinte — o erro aparece intermitente e só sob carga, que é o
    pior jeito de descobrir.

    `prepare_threshold=None` desliga o preparo. O custo é replanejar a query a
    cada execução; a alternativa é um bug que não reproduz em teste.
    """
    if settings.usa_pooler_de_transacao:
        return {"prepare_threshold": None}
    return {}


engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    echo=settings.db_echo,
    connect_args=_connect_args(),
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

# Conexão privilegiada (dono das tabelas, RLS não se aplica).
# Existe por um motivo só: no login ainda não há tenant, e é preciso encontrar
# o usuário para descobrir a que organização ele pertence. Nenhuma rota de
# negócio deve usá-la — veja `get_auth_db` em app/core/deps.py.
auth_engine = create_engine(
    settings.owner_url,
    pool_pre_ping=True,
    pool_size=2,
    connect_args=_connect_args(),
    future=True,
)
AuthSessionLocal = sessionmaker(
    bind=auth_engine, autoflush=False, expire_on_commit=False, future=True
)


def set_tenant(session: Session, org_id: uuid.UUID | None) -> None:
    """Fixa o tenant corrente na conexão desta sessão.

    `set_config(..., true)` = escopo de transação: o valor cai sozinho no
    commit/rollback, então uma conexão devolvida ao pool nunca leva o tenant
    da requisição anterior.
    """
    session.execute(
        text("SELECT set_config(:guc, :val, true)"),
        {"guc": settings.tenant_guc, "val": str(org_id) if org_id else ""},
    )


@contextmanager
def session_scope(org_id: uuid.UUID | None = None) -> Generator[Session]:
    """Sessão para workers e scripts, fora do ciclo de requisição."""
    session = SessionLocal()
    try:
        if org_id is not None:
            set_tenant(session, org_id)
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
