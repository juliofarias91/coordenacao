-- Executado uma única vez, na criação do volume do Postgres.
--
-- Papel de aplicação: é com ele que a API abre as conexões das requisições.
-- Ele NÃO é dono das tabelas, então o row-level security (habilitado na
-- migration 0001) vale para ele — é essa a segunda camada de isolamento
-- multi-tenant, além do org_id injetado no query builder.
--
-- O usuário das migrations (POSTGRES_USER) continua sendo o dono e passa
-- por cima do RLS, o que é o comportamento desejado para o Alembic.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spbim_app') THEN
    CREATE ROLE spbim_app LOGIN PASSWORD 'spbim_app';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE spbim_auditoria TO spbim_app;
GRANT USAGE ON SCHEMA public TO spbim_app;

-- Vale para as tabelas que a migration ainda vai criar.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spbim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO spbim_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
