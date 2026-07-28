"""Prepara um projeto Supabase para receber a plataforma.

    python -m scripts.supabase_bootstrap            # cria o papel, migra, confere
    python -m scripts.supabase_bootstrap --conferir # só diagnostica, não escreve

Existe porque o roteiro do `docs/SUPABASE.md` pressupõe `psql`, que não está
em toda máquina — e porque a ordem dos passos não perdoa: a migration 0001 só
concede permissão nas 23 tabelas se o papel de aplicação já existir (ela
consulta `pg_roles`). Criar o papel depois deixa a API conectando e levando
`permission denied` em toda tabela, e rodar o Alembic de novo não repara —
a revisão já consta aplicada. Aqui a ordem é o próprio código.

Idempotente: reexecutar reaplica os GRANTs e sincroniza a senha do papel.

As duas conexões vêm do .env e são diferentes de propósito:

  DATABASE_URL      dono das tabelas, pooler em modo sessão (5432) — DDL
  APP_DATABASE_URL  papel spbim_app, pooler em modo transação (6543) — a API

A senha do papel é extraída de APP_DATABASE_URL em vez de pedida à parte: é o
que garante que o papel criado no banco e a URL que a API usa não divirjam.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from psycopg import sql

from app.core.config import SENHAS_DE_DEV, settings

BACKEND = Path(__file__).resolve().parents[1]

# O que a migration 0001 deixa no banco. Usado só como diagnóstico: quem manda
# no schema é o Alembic.
TABELAS_ESPERADAS = 23
POLICIES_ESPERADAS = 23


def _dsn(url: str) -> str:
    """URL do SQLAlchemy -> DSN do psycopg (o dialeto `+psycopg` é do primeiro)."""
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def _erro(msg: str) -> int:
    print(f"\n  ERRO: {msg}\n", file=sys.stderr)
    return 1


def _validar() -> str | None:
    """Devolve a mensagem do primeiro problema de configuração, ou None."""
    if not settings.database_url:
        return "DATABASE_URL vazia no .env — é a conexão de dono, usada para o DDL."
    if not settings.app_database_url:
        return "APP_DATABASE_URL vazia no .env — é a conexão da API, pelo pooler."

    for nome, url in (
        ("DATABASE_URL", settings.database_url),
        ("APP_DATABASE_URL", settings.app_database_url),
    ):
        senha = urlsplit(url).password
        if senha is None:
            return f"{nome} não traz senha."
        if "COLE_A_SENHA" in senha:
            return (
                f"{nome} ainda está com o placeholder. A senha do `postgres` está em "
                "Settings > Database > Database password, no painel do Supabase; "
                "a do `spbim_app` é escolha sua — é o papel que este script cria."
            )
        if senha in SENHAS_DE_DEV:
            return f"{nome} está com senha de desenvolvimento embutida."
    return None


def _papel_e_senha() -> tuple[str, str]:
    """Nome do papel no Postgres e a senha, tirados de APP_DATABASE_URL.

    O usuário da URL leva o project_ref como sufixo (`spbim_app.abcdef`) — isso
    é roteamento do Supavisor, não faz parte do nome do papel. `CREATE ROLE
    spbim_app.abcdef` seria um papel que ninguém procura.
    """
    partes = urlsplit(settings.app_database_url)
    usuario = (partes.username or settings.app_db_user).split(".")[0]
    return usuario, partes.password or ""


def _opcional(cur: psycopg.Cursor, comando: sql.Composable | str) -> None:
    """Executa um comando cuja recusa não invalida o bootstrap.

    Num Postgres gerenciado nem tudo pertence ao papel com que se conecta, e
    abortar por um comando redundante deixaria o banco pela metade — que é o
    estado caro, porque a migration só concede permissão uma vez. Com
    `autocommit`, cada comando é sua própria transação e a falha não contamina
    os seguintes.
    """
    try:
        cur.execute(comando)
    except psycopg.Error as exc:
        print(f"    (ignorado) {str(exc).strip().splitlines()[0]}")


def _diagnostico(conn: psycopg.Connection, papel: str) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT current_database(), current_user, version()")
        banco, usuario, versao = cur.fetchone()
        print(f"  banco.............. {banco} (conectado como {usuario})")
        print(f"  servidor........... {versao.split(' on ')[0]}")

        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (papel,))
        print(f"  papel {papel}.... {'existe' if cur.fetchone() else 'AUSENTE'}")

        cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'")
        print(f"  pgcrypto........... {'instalado' if cur.fetchone() else 'AUSENTE'}")

        cur.execute(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        tabelas = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")
        policies = cur.fetchone()[0]
        print(f"  tabelas em public.. {tabelas}")
        print(f"  policies de RLS.... {policies} (esperado {POLICIES_ESPERADAS})")

        # Uma tabela sem RLS é um vazamento silencioso: o SELECT devolve tudo e
        # nada acusa. Vale mais do que a contagem acima.
        cur.execute(
            "SELECT tablename FROM pg_tables t WHERE schemaname = 'public' "
            "AND tablename <> 'alembic_version' AND NOT EXISTS ("
            "  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "  WHERE n.nspname = 'public' AND c.relname = t.tablename AND c.relrowsecurity)"
        )
        sem_rls = [r[0] for r in cur.fetchall()]
        if sem_rls:
            print(f"  SEM row-level security: {', '.join(sem_rls)}")


def _criar_papel(conn: psycopg.Connection, papel: str, senha: str) -> None:
    """O equivalente de infra/supabase/01-app-role.sql, sem depender de psql."""
    ident = sql.Identifier(papel)
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (papel,))
        existe = cur.fetchone() is not None

        # DDL não aceita parâmetro; `sql.Literal` faz o escape do lado do cliente.
        verbo = sql.SQL("ALTER" if existe else "CREATE")
        cur.execute(
            sql.SQL("{} ROLE {} LOGIN PASSWORD {}").format(verbo, ident, sql.Literal(senha))
        )
        print(f"  papel {papel}: {'senha sincronizada' if existe else 'criado'}")

        cur.execute("SELECT current_database()")
        banco = sql.Identifier(cur.fetchone()[0])
        # No Supabase o banco pertence a `supabase_admin`, não ao `postgres` com
        # que conectamos — este GRANT pode ser negado. Não é fatal: PUBLIC já tem
        # CONNECT por padrão, então o comando é confirmação, não requisito.
        _opcional(cur, sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(banco, ident))
        cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(ident))

        # Para o que a migration ainda vai criar. Vale para os objetos criados
        # por *este* papel — o mesmo que o Alembic usa, por isso o DDL todo
        # passa por DATABASE_URL.
        cur.execute(
            sql.SQL(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {}"
            ).format(ident)
        )
        cur.execute(
            sql.SQL(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "GRANT USAGE, SELECT ON SEQUENCES TO {}"
            ).format(ident)
        )

        # E para o que já existe. O `ALTER DEFAULT PRIVILEGES` acima não alcança
        # tabela criada antes dele, e a migration 0001 só concede permissão se o
        # papel existir quando ela roda — num banco onde a ordem se inverteu, ou
        # onde o papel foi recriado, é aqui que o buraco fecha. Idempotente.
        cur.execute(
            sql.SQL(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {}"
            ).format(ident)
        )
        cur.execute(
            sql.SQL("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {}").format(ident)
        )
        # No Supabase costuma já vir instalada, no schema `extensions`. O
        # IF NOT EXISTS cobre isso; a tolerância cobre a falta de privilégio.
        _opcional(cur, "CREATE EXTENSION IF NOT EXISTS pgcrypto")
        print("  permissões e pgcrypto aplicados")


def _migrar() -> int:
    """`alembic upgrade head` — pela conexão de dono, nunca pelo pooler de transação."""
    print("\n[3/4] alembic upgrade head")
    return subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND
    ).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--conferir",
        action="store_true",
        help="só diagnostica a configuração e o estado do banco; não escreve nada",
    )
    args = parser.parse_args()

    if (problema := _validar()) is not None:
        return _erro(problema)

    papel, senha = _papel_e_senha()
    owner = urlsplit(settings.database_url)
    print(f"\n[1/4] conectando em {owner.hostname}:{owner.port} como dono das tabelas")

    try:
        conn = psycopg.connect(_dsn(settings.database_url), connect_timeout=15, autocommit=True)
    except psycopg.OperationalError as exc:
        return _erro(
            f"não foi possível conectar: {exc}".rstrip()
            + "\n\n  Se for timeout, confira que o host é o pooler "
            "(aws-<n>-<regiao>.pooler.supabase.com) e não db.<ref>.supabase.co —\n"
            "  esse último só publica IPv6. Se for autenticação, a senha do .env está errada."
        )

    with conn:
        _diagnostico(conn, papel)
        if args.conferir:
            print("\n  --conferir: nada foi alterado.\n")
            return 0

        print(f"\n[2/4] papel de aplicação `{papel}`")
        _criar_papel(conn, papel, senha)

    if (codigo := _migrar()) != 0:
        return _erro(f"o alembic saiu com código {codigo} — o schema NÃO foi aplicado.")

    print("\n[4/4] estado final")
    with psycopg.connect(_dsn(settings.database_url), connect_timeout=15) as conn:
        _diagnostico(conn, papel)

    print(
        "\n  Pronto. O aceite de verdade é o RLS respondendo pelo papel de aplicação:\n"
        "      pytest tests/test_tenant_isolation.py -v\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
