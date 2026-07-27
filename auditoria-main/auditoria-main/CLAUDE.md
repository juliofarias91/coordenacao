# SPBIM — Plataforma de Auditoria BIM

Plataforma SaaS que audita modelos BIM (Revit/IFC) contra critérios de um PEB, elimina as planilhas de controle manuais e entrega relatórios/portal do cliente. **A SPBIM é a proprietária da solução**; ela atende vários **clientes**, cada um com vários **projetos** (o projeto de referência é o **CPQ11**).

Princípio central: **a auditoria é a única fonte de dado. Painel de controle, matriz, relatório e KPIs são visões derivadas** — é isso que substitui a planilha.

## Stack

- **Backend:** Python · FastAPI · PostgreSQL 15+ · Celery/Redis (workers) · S3 (arquivos)
- **Frontend:** React + TypeScript
- **Automação BIM:** IfcOpenShell (IFC, in-house) · Autodesk Platform Services / Model Derivative (Revit)
- **Auth:** OIDC/SSO + JWT (nada de senha em texto — o mock do protótipo NÃO é referência de auth)
- Multi-tenant: toda entidade carrega `org_id`. Hierarquia: organização → cliente → projeto.

## Fonte de verdade (leia antes de codar)

- `docs/Plano_Tecnico_Piloto_SPBIM.md` — **arquitetura, schema PostgreSQL (DDL), endpoints da API, estratégia de automação, roadmap por fases.** É o documento mestre.
- `docs/Especificacao_Plataforma_Auditoria_BIM.md` — modelo de dados conceitual e regras de negócio.
- `docs/Backlog_Piloto_SPBIM.md` — backlog do piloto (se precisar de tarefas granularizadas).
- `docs/prototipo_auditoria_bim.html` — **protótipo navegável**: define a UI, os fluxos e os estados. É a referência visual do frontend. Abra no navegador para ver as telas.

## Ordem de construção (roadmap — ver plano técnico, seção 8)

0. Setup: repositório, Postgres, docker-compose, auth SSO, schema base.
1. Cadastro (projeto, empresas/projetistas, disciplinas, critérios, usuários) + API.
2. Ingestão de modelos (ACC) + execução manual de auditoria + não-conformidade + relatório/controle.
3. **Automação:** validação de nomenclatura (nível 0) + auditoria 4D de parâmetros em IFC (IfcOpenShell). É a primeira automação ponta a ponta e a maior prova de valor.
4. Portal do cliente, notificações, penalidades, KPIs/placar de conformidade.
5. Piloto assistido em um projeto real.

## Convenções

- Não implemente tudo de uma vez. Proponha estrutura/decisão, **mostre e peça aprovação antes de avançar de fase.**
- Multi-tenant sempre: injetar `org_id` do token em toda query.
- Bilíngue (PT/EN) na UI — o protótipo já traz os textos nos dois idiomas.
- Nomenclatura de arquivos do domínio: `PROJETO-MACRO-DISC-SUB-SETOR-SW` (ex.: `CPQ11-C-STRC-CONCR-ADMIN-R22`).
- Inicialize git cedo e faça commits por etapa.
- Ao replicar uma tela, use o protótipo HTML como referência direta de layout e comportamento.

## Estado atual

**As seis fases do roadmap estão implementadas.** Ver `README.md` para como rodar e para as decisões de arquitetura, `docs/OPERACAO.md` para o runbook de produção e `docs/PILOTO.md` para o roteiro do piloto assistido.

- **Fase 0** — schema completo (23 tabelas, 12 enums), RLS multi-tenant, auth Argon2+JWT, OIDC/PKCE (desligado), Celery, shell React, CI.
- **Fase 1** — cadastro: projetos, empresas+contatos+subcontratação, usuários+permissões, standards+nomenclatura, disciplinas, critérios+checklists.
- **Fase 2** — execução: modelos e versões com upload para o S3, ingestão via webhook do ACC, auditoria com estados e publicação de round, não-conformidades, painel/matriz derivados e exports (PDF/XLSX).
- **Fase 3** — automação: validador de nomenclatura com penalidade e notificação, motor de verificadores, auditoria 4D de parâmetros e de categorias em IFC (IfcOpenShell), extração de propriedades Revit (APS) e worker Celery com retry.
- **Fase 4** — colaboração: central de notificações, KPIs com gráficos, placar de conformidade por fornecedor, apontamentos, portal do cliente com visibilidade por campo e trilha de auditoria automática.

- **Fase 5** — piloto: imagens e compose de produção, guarda que recusa segredo de desenvolvimento, log em JSON, backup do banco e do bucket com restauração verificada, workflow de publicação e o importador de projeto por YAML.

72 endpoints; 190 testes contra Postgres, MinIO e arquivos IFC reais.

**O que resta não é código:** subir o ambiente produtivo num servidor e rodar o piloto assistido. Se o usuário pedir "continue", pergunte o que ele quer — não há próxima fase para implementar sozinho.

Ao continuar:
- `backend/app/api/v1/` tem o padrão de rota (permissão via `requer_permissao`, sessão via `get_tenant_db`, 404 via `services/escopo.py`).
- `backend/app/services/auditoria.py` concentra as regras da execução — leia antes de mexer em estado de round.
- `backend/app/services/automacao/executor.py` tem o registro de verificadores: para automatizar um critério novo, acrescente uma entrada em `VERIFICADORES` ou dê a ele um `parametro_esperado`.
- `backend/tests/` tem o padrão de teste: `cenario` monta uma organização isolada, `auditavel` vai até o ponto de auditar, e `ifc_fabrica.py` gera IFC de verdade.

**Cinco armadilhas já pagas — não reverta:**
- O `db.flush()` no início de `recalcular_aprovacao`: a sessão roda com `autoflush=False` e sem ele o percentual sai um passo atrasado.
- `broker_connection_max_retries=0` no Celery significa "tentar para sempre". Precisa ser positivo.
- `fila_disponivel()` checa o broker por socket antes de qualquer `delay()`; sem isso um Redis fora do ar prende a requisição por ~107 s.
- O autor da trilha vem do `AutorMiddleware`, não de `get_current_user`: rota síncrona roda em threadpool e a `ContextVar` definida lá dentro não volta para o chamador.
- `_garantir_id` no `before_flush`: defaults de coluna só são avaliados no INSERT, então sem ele toda criação entra na trilha sem dizer o que foi criada.

**Ao criar gráfico:** as cores saem de token de tema (`var(--macro-X)`), nunca do hex da API — o modo escuro tem passos próprios. A paleta foi validada; se mexer nela, revalide.

**Não verificado contra sistema externo:** o cliente APS (`services/aps.py` e `services/automacao/revit.py`) foi exercitado só com respostas gravadas — falta credencial do developer hub (decisão aberta nº 3).
