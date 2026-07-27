# Como continuar no Claude Code

Este pacote é o ponto de partida do repositório da plataforma de auditoria BIM da SPBIM.
Conteúdo: `CLAUDE.md` (briefing que o Claude Code lê sozinho), este guia, e `docs/` com o plano técnico, a especificação, o backlog e o protótipo navegável.

## 1. Preparar

1. Descompacte esta pasta onde vai ficar o repositório (ex.: `~/spbim-auditoria/`).
2. Instale o Claude Code:
   - **Mais fácil (interface gráfica):** app Desktop do Claude — usa o Claude Code sem terminal.
   - **Terminal (nativo, recomendado):** instalador nativo (sem Node.js). Alternativa via npm: `npm install -g @anthropic-ai/claude-code` (Node 18+, versões recentes pedem Node 22).
   - Requer plano pago (Pro/Max/Team) ou créditos de API. O plano grátis não inclui.
3. Abra o Claude Code **nesta pasta**. Ele lê o `CLAUDE.md` automaticamente.

## 2. Primeiro prompt (Fase 0 — estrutura + banco)

```
Leia os três documentos em docs/. Este é o projeto que vamos construir.
Vamos começar pela Fase 0 do roadmap do plano técnico:
1) Proponha a estrutura de pastas do repositório (backend FastAPI, frontend React, infra).
2) Crie o docker-compose com Postgres.
3) Gere as migrations com o schema do PostgreSQL descrito no plano técnico.
Não implemente as telas ainda — primeiro a estrutura e o banco.
Mostre a estrutura de pastas e o schema antes de seguir, para eu aprovar.
Inicialize o git e faça um commit inicial.
```

## 3. Prompts das fases seguintes (uma de cada vez)

- **Fase 1 — Cadastro + API:**
  "Implemente a Fase 1: models/CRUD e endpoints de projeto, empresas/projetistas (com subcontratação e contatos), disciplinas, critérios e usuários, conforme o plano técnico. Inclua auth JWT com papéis e o isolamento por org_id. Escreva testes básicos."

- **Fase 2 — Execução da auditoria:**
  "Implemente a ingestão de modelos, a execução manual de auditoria (checklists herdados da disciplina), não-conformidades e os exports de relatório (PDF) e controle (Excel). Use o protótipo como referência de fluxo."

- **Fase 3 — Automação (maior prova de valor):**
  "Implemente a validação de nomenclatura (nível 0) e a auditoria 4D de parâmetros em IFC com IfcOpenShell rodando num worker Celery, conforme a seção 6 do plano técnico. Falhas devem virar ocorrências (IDs)."

- **Fase 4 — Portal/KPIs:**
  "Implemente o portal do cliente (read-only, visibilidade por campo), notificações, penalidades de nomenclatura e a página de KPIs com o placar de conformidade por fornecedor."

## 4. Dicas

- Mantenha o protótipo (`docs/prototipo_auditoria_bim.html`) aberto no navegador como espelho da UX. Ao criar uma tela, peça: "replique esta tela do protótipo em React".
- Peça revisão contra os docs ao fim de cada fase: "confira o que implementamos contra o plano técnico e liste divergências".
- Commits frequentes, por etapa.
- Decisões em aberto (FastAPI vs Django, SSO, orçamento de tokens APS, revisor obrigatório) estão listadas na seção 9 do plano técnico — decida com o time antes das fases que dependem delas.
