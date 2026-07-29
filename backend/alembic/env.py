"""Ambiente do Alembic.

Roda com o usuário DONO das tabelas (`settings.alembic_url`), que passa por
cima do row-level security — é o comportamento desejado para migrar.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, text

from alembic import context
from app.core.config import settings
from app.models import Base  # noqa: F401 — popula o metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.alembic_url)

# Lock consultivo: identificador arbitrário, igual em todos os processos que
# migram o mesmo banco. Vem do ambiente para que um segundo banco no mesmo
# servidor possa usar outro — dois bancos distintos não deveriam esperar um
# pelo outro.
ID_LOCK = int(os.environ.get("ALEMBIC_LOCK_ID", "728301"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.alembic_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # API e worker sobem juntos e chamam `upgrade head` os dois. Sem o
        # lock, os dois começariam a aplicar a mesma revisão e o segundo
        # quebraria no meio — tabela já existe, constraint duplicada — com o
        # schema num estado que nenhum dos dois pretendia.
        #
        # `pg_advisory_lock` e não `LOCK TABLE`: ele é da SESSÃO, então
        # protege as migrations inteiras, e não só uma transação. Quem espera
        # entra depois com o schema já em dia, e seu `upgrade` vira no-op.
        connection.execute(text("SELECT pg_advisory_lock(:id)"), {"id": ID_LOCK})
        try:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
        finally:
            # Fechar a conexão já libertaria o lock; soltar explicitamente
            # deixa isso legível e cobre o caso de a conexão ser reaproveitada.
            connection.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": ID_LOCK})


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
