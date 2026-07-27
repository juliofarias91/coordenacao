# Backlog do Piloto — Plataforma de Auditoria BIM (SPBIM)

Backlog acionável derivado do `Plano_Tecnico_Piloto_SPBIM.md`, organizado nas 6 fases do roadmap. Cada ticket tem um id, uma descrição e critérios de aceite (CA). Estimativas em *story points* relativos (P=pequeno ~1d, M=médio ~2–3d, G=grande ~1 semana).

Legenda de labels: `backend` · `frontend` · `infra` · `automação` · `integração`

---

## Fase 0 — Setup e fundação

**SP-001 · Repositório e CI/CD** — `infra` · P
Monorepo (ou back/front separados), lint, testes, pipeline de build. CA: PR abre roda testes; merge na main gera artefato/deploy em ambiente de dev.

**SP-002 · Banco e migrações** — `infra` · M
PostgreSQL provisionado; ferramenta de migração (Alembic). Aplicar o esquema da seção 3 do plano. CA: `migrate up/down` limpo; enums e FKs criados; seed mínimo (1 org, 1 projeto).

**SP-003 · Autenticação SSO/OIDC + JWT** — `backend` · G
Login via identidade (Autodesk ou corporativa) com fallback de senha (Argon2). Middleware de JWT. CA: login retorna token; rotas protegidas rejeitam sem token; senha nunca trafega/armazena em texto.

**SP-004 · Multi-tenant + isolamento** — `backend` · M
`org_id` injetado no contexto da request; row-level security no Postgres. CA: usuário de uma org nunca lê dado de outra (teste automatizado).

**SP-005 · Shell do frontend** — `frontend` · M
Esqueleto React com o design do protótipo (tema claro/escuro, PT/EN, layout com barra lateral e portal do cliente). CA: navegação entre telas vazias; toggles funcionam; login integrado ao SP-003.

---

## Fase 1 — Cadastro completo

**SP-101 · CRUD Projeto & Cliente** — `backend`+`frontend` · M
CA: criar/editar projeto com código único por org; tela reflete o protótipo.

**SP-102 · CRUD Empresas + contatos + subcontratação** — `backend`+`frontend` · G
CA: empresa própria/terceirizada; `contratada_por` referenciando outra empresa; múltiplos contatos com cargo/e-mail/telefone/disciplina; upload de logo para o S3.

**SP-103 · CRUD Usuários & permissões** — `backend`+`frontend` · M
CA: papéis e permissões finas persistidos; papel `cliente` isolado; status ativo/inativo respeitado no login.

**SP-104 · Standards + padrão de nomenclatura** — `backend`+`frontend` · M
CA: CRUD de standards; padrão de nomenclatura armazenado como segmentos (jsonb) editável por segmento.

**SP-105 · CRUD Disciplinas (o elo)** — `backend`+`frontend` · M
CA: disciplina amarra projetista + checklists aplicáveis + nomenclatura + áreas; código único por projeto.

**SP-106 · Biblioteca de critérios + checklists** — `backend`+`frontend` · G
CA: critério canônico bilíngue reutilizável; checklist referencia critérios por id; editar critério reflete em todos os checklists que o usam.

**SP-107 · Padrão de cores por macrodisciplina** — `frontend` · P
CA: cores editáveis aplicadas a listas, matriz e gráficos.

---

## Fase 2 — Ingestão e execução manual

**SP-201 · Ingestão via ACC (webhook/polling)** — `integração` · G
CA: nova versão na pasta MODELS do ACC cria `versao_modelo`, baixa o arquivo para o S3, registra `urn` (Revit) e dispara a auditoria aplicável.

**SP-202 · Upload manual de versão** — `backend`+`frontend` · M
CA: subir .ifc/.rvt manualmente cria versão equivalente ao fluxo do ACC.

**SP-203 · Execução de auditoria (nível modelo)** — `backend`+`frontend` · G
CA: abrir versão mostra abas conforme a disciplina; alternar status por item recalcula aprovação; comentário e evidência (upload) persistidos.

**SP-204 · Não-conformidades** — `backend`+`frontend` · M
CA: gerar NC a partir de item reprovado; editar descrição/recomendação/responsável/prazo/status; guardar IDs de elementos.

**SP-205 · Estados e publicação de round** — `backend`+`frontend` · M
CA: auditoria em `nao_publicado`→`publicado`→`desatualizado`; publicação registra round e data; histórico de rounds consultável.

**SP-206 · Views derivadas: painel + matriz LOD 500** — `backend`+`frontend` · M
CA: painel e matriz por área saem de consulta às auditorias (sem tabela de controle própria).

**SP-207 · Exportação PDF (relatório) e Excel (controle)** — `backend` · M
CA: relatório de RNC em PDF com cabeçalho SPBIM; controle modelo×status em .xlsx.

---

## Fase 3 — Automação (o diferencial)

**SP-301 · Validador de nomenclatura + penalidade + notificação** — `backend` · M
CA: `POST /nomenclatura/validar` retorna conforme/divergente por segmento; divergência grava `penalidade` no ledger e cria `notificacao`.

**SP-302 · Worker de auditoria assíncrono** — `infra`+`automação` · M
CA: fila (Celery/Redis); publicação de versão enfileira job; falha e retry observáveis.

**SP-303 · Auditoria 4D de parâmetros em IFC (IfcOpenShell)** — `automação` · G · **prioridade**
CA: worker lê o IFC, verifica presença dos parâmetros 4D por elemento, grava `resultado_check` e explode falhas em `ocorrencia` (IDs). Sem custo de token.

**SP-304 · Auditoria de propriedades Revit (APS Model Derivative)** — `automação`+`integração` · G
CA: extrai árvore de propriedades por `urn` e roda a mesma comparação da SP-303; custo de token monitorado.

**SP-305 · Auditoria IFC de categorias/consistência** — `automação` · M
CA: compara IfcElementAssembly contra o dicionário; parâmetros compartilhados presentes.

---

## Fase 4 — Colaboração e visão executiva

**SP-401 · Central de notificações** — `backend`+`frontend` · M
CA: notificações por usuário/papel; auditorias publicadas, erros e penalidades; marcar lida; badge de não-lidas.

**SP-402 · Placar de conformidade por fornecedor** — `backend`+`frontend` · M
CA: índice por empresa a partir de aprovação, penalidades e NCs; ranking exposto nos KPIs.

**SP-403 · KPIs do projeto** — `backend`+`frontend` · M
CA: indicadores e gráficos (aprovação por macro, status, distribuição, evolução por round) via `GET /kpis`.

**SP-404 · Apontamentos (Issues) + sync ACC** — `integração` · G
CA: CRUD de apontamentos; sincronização (saída no piloto) com ACC Issues.

**SP-405 · Portal do cliente (visibilidade por campo)** — `backend`+`frontend` · G
CA: convite gera token; `GET /portal/{token}` retorna só as seções/colunas liberadas; nunca expõe API interna.

**SP-406 · Trilha de auditoria (audit log)** — `backend` · M
CA: toda alteração de entidade de negócio registra quem/quando/diff.

---

## Fase 5 — Piloto assistido

**SP-501 · Deploy de produção + backups** — `infra` · M
CA: ambiente produtivo; backup automático do Postgres e do S3; monitoramento básico.

**SP-502 · Onboarding de um projeto real** — `—` · G
CA: cadastrar um projeto real (sucessor do CPQ11), importar disciplinas/critérios, rodar a primeira auditoria automatizada de ponta a ponta.

**SP-503 · Ajustes de piloto** — `—` · G
CA: coletar feedback da coordenação SPBIM e dos fornecedores; backlog de ajustes priorizado.

---

## Caminho crítico sugerido

`SP-001→002→003` (fundação) → `SP-201` (ingestão) → `SP-203/204` (execução) → **`SP-303`** (primeira automação, prova a tese) → `SP-405` (portal do cliente) → `SP-502` (piloto real).

Tudo o mais pode paralelizar em torno desse eixo. A entrega que muda o jogo é a **SP-303**: a partir dela, a auditoria 4D deixa de ser manual.
