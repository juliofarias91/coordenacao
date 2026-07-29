"""Ambiente do Alembic.

Roda com o usuário DONO das tabelas (`settings.alembic_url`), que passa por
cima do row-level security — é o comportamento desejado para migrar.
"""

from __future__ import annotations

import contextlib
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
    # API e worker sobem juntos e chamam `upgrade head` os dois. Sem o lock, os
    # dois começariam a aplicar a mesma revisão e o segundo quebraria no meio —
    # tabela já existe, constraint duplicada — com o schema num estado que
    # nenhum dos dois pretendia.
    #
    # `pg_advisory_lock` e não `LOCK TABLE`: ele é da SESSÃO, então protege as
    # migrations inteiras, e não só uma transação. Quem espera entra depois com
    # o schema já em dia, e seu `upgrade` vira no-op.
    #
    # A CONEXÃO DO LOCK É SEPARADA, e isto não é preciosismo — é a correção de
    # um bug que passou por aqui: no SQLAlchemy 2.0 o primeiro `execute()` numa
    # conexão abre uma transação implícita. Tomando o lock na conexão do
    # Alembic, `context.begin_transaction()` encontrava a transação já aberta,
    # virava no-op, e NINGUÉM COMMITAVA — o `upgrade head` imprimia "Running
    # upgrade 0003 -> 0004", saía com código 0 e não gravava nada. Falha
    # silenciosa num comando que o container roda sozinho no deploy.
    with connectable.connect() as trava:
        trava.execute(text("SELECT pg_advisory_lock(:id)"), {"id": ID_LOCK})
        # Fecha a transação implícita SEM soltar o lock: lock consultivo de
        # sessão sobrevive a commit e a rollback — só `unlock` ou o fim da
        # sessão o liberam.
        trava.commit()
        try:
            with connectable.connect() as connection:
                context.configure(
                    connection=connection,
                    target_metadata=target_metadata,
                    compare_type=True,
                )
                with context.begin_transaction():
                    context.run_migrations()
        finally:
            # `suppress` porque a conexão pode estar em estado ruim se algo
            # explodiu acima — e aí o erro daqui substituiria o de verdade na
            # saída, deixando o log com "transaction is aborted" no lugar da
            # causa. Fechar a sessão solta o lock de qualquer forma.
            with contextlib.suppress(Exception):
                trava.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": ID_LOCK})
                trava.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
