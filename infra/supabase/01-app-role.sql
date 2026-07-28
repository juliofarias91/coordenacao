-- Papel de aplicação no Supabase. Rode UMA VEZ, antes do `alembic upgrade head`.
--
-- É o gêmeo de infra/postgres/init/01-app-role.sql, que serve ao Postgres do
-- docker-compose. Vive fora de `init/` de propósito: o que está lá é executado
-- automaticamente na criação do volume local, e este arquivo quebraria ali
-- (referencia o banco errado). Nada o executa sozinho — é sempre à mão.
--
-- O que muda em relação ao de dev:
--   - o banco chama `postgres`, não `spbim_auditoria`;
--   - a senha entra por variável, porque este papel vai para produção. O de
--     dev tem senha fixa no arquivo, o que só é aceitável em dev.
--
-- Uso:
--   psql "$DATABASE_URL" -v senha_app="'...'" -f infra/supabase/01-app-role.sql
--
-- Sem psql à mão, o painel do Supabase (SQL Editor) executa o mesmo efeito —
-- veja o bloco pronto para colar em docs/SUPABASE.md, seção "O banco".
--
-- A ordem importa: a migration 0001 emite os GRANTs nas 23 tabelas apenas se
-- o papel já existir (ela consulta `pg_roles`). Criar depois deixaria a API
-- conectando e recebendo "permission denied" em toda tabela.

\set ON_ERROR_STOP on

-- CREATE ou ALTER conforme o papel já exista: idempotente, e reexecutar troca
-- a senha em vez de falhar. Fora de um bloco DO$$ porque o psql não expande
-- variáveis dentro de string dollar-quoted — a senha chegaria literal.
SELECT format(
  '%s ROLE spbim_app LOGIN PASSWORD %L',
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spbim_app')
       THEN 'ALTER' ELSE 'CREATE' END,
  :'senha_app'
) \gexec

GRANT CONNECT ON DATABASE postgres TO spbim_app;
GRANT USAGE ON SCHEMA public TO spbim_app;

-- Vale para as tabelas que a migration ainda vai criar. Aplica-se aos objetos
-- criados pelo papel que executa este comando, então rode como `postgres` —
-- o mesmo que o Alembic usa.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spbim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO spbim_app;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
