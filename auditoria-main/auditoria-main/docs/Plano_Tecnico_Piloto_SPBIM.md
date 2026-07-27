# Plano Técnico do Piloto — Plataforma de Auditoria BIM (SPBIM)

**Projeto de referência:** CPQ11 · **Proprietária da solução:** SPBIM
**Documento complementar:** `Especificacao_Plataforma_Auditoria_BIM.md` (modelo de dados conceitual)
**Objetivo deste documento:** dar ao time de desenvolvimento o suficiente para tirar a plataforma do protótipo e colocá-la em um projeto piloto real — arquitetura, banco de dados, API e a primeira auditoria automatizada.

---

## 1. Escopo do piloto

O piloto valida a tese central da plataforma: **a auditoria é a única fonte de dado; controle, relatório e portal do cliente são visões derivadas** — eliminando as planilhas de controle mantidas à mão.

Dentro do escopo:

- Cadastro do projeto, cliente, projetistas (com subcontratação), nomenclaturas, disciplinas e usuários.
- Biblioteca de critérios (derivados do PEB/A5.37) e checklists por disciplina.
- Ingestão de modelos e versões (upload manual + leitura do ACC).
- Execução de auditoria com estados, comentários, evidências e não-conformidades.
- **Uma auditoria automatizada** ponta a ponta (ver seção 6).
- Validador de nomenclatura com penalidade e notificação.
- Relatório (PDF) e controle (Excel) exportáveis; portal do cliente read-only.
- KPIs e placar de conformidade por fornecedor.

Fora do escopo do piloto (fase seguinte): automação de auditorias que exigem Revit headless (Design Automation), cronograma 4D completo, integração com Autodesk Forma.

---

## 2. Arquitetura

Stack recomendada, justificada pelo ecossistema BIM ser majoritariamente Python (IfcOpenShell, SDKs da Autodesk):

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | React + TypeScript | Reaproveita a estrutura e o design do protótipo (tema claro/escuro, PT/EN). |
| API | Python · FastAPI | Assíncrono, tipado, OpenAPI automático. Django REST é alternativa se o time preferir admin pronto. |
| Banco | PostgreSQL 15+ | Relacional; multi-tenant por `org_id`. |
| Fila / workers | Celery + Redis (ou RQ) | Processamento assíncrono das auditorias automatizadas e da ingestão. |
| Storage | S3 (ou compatível) | Modelos (.ifc/.rvt), evidências, exports. |
| Automação BIM | IfcOpenShell (IFC) · Autodesk Platform Services / Model Derivative (Revit) | Ver seção 6. |
| Auth | OIDC/SSO (Autodesk ou corporativo) + JWT | Substitui o mock do protótipo. |

Fluxo de alto nível:

```
Fornecedor → upload no ACC (pasta MODELS)
        │
        ▼
[Webhook ACC / polling]  →  Ingestão (worker)  →  VersaoModelo + arquivo no S3
        │
        ▼
Auditoria automática (worker: IfcOpenShell / APS)  →  ResultadoCheck + Ocorrencia
        │
        ▼
Revisão humana (coordenação SPBIM)  →  NaoConformidade  →  Notificação
        │
        ▼
Visões derivadas: Controle · Relatório PDF · Portal do cliente · KPIs
```

Princípios: **multi-tenant** (uma instância serve vários clientes da SPBIM, isolados por `org_id`); **event-driven** (publicação de versão dispara auditoria; divergência dispara notificação); **auditável** (trilha de quem mudou o quê).

---

## 3. Modelo de dados (PostgreSQL)

O esquema abaixo consolida as entidades da especificação com o que o protótipo revelou (rounds, penalidades, notificações, apontamentos, visibilidade do cliente). Chaves são `uuid`; toda tabela de negócio carrega `org_id` para isolamento multi-tenant e `created_at/updated_at`.

### 3.1 Enums

```sql
CREATE TYPE macro_disc   AS ENUM ('A','C','M','S');           -- ARCH, CIVIL/ESTRUT, MEP, SITE
CREATE TYPE empresa_tipo AS ENUM ('propria','terceirizada');
CREATE TYPE empresa_papel AS ENUM ('trade','bim','fornecedor','coordenacao');
CREATE TYPE versao_formato AS ENUM ('revit','ifc');
CREATE TYPE checklist_tipo AS ENUM ('geral','ifc','4d','lod400','lod500');
CREATE TYPE criterio_nivel AS ENUM ('modelo','elemento');
CREATE TYPE automacao AS ENUM ('auto','design_automation','manual');
CREATE TYPE check_status AS ENUM ('aprovado','reprovado','pendente','na');
CREATE TYPE origem_result AS ENUM ('automatico','manual');
CREATE TYPE auditoria_estado AS ENUM ('publicado','nao_publicado','desatualizado');
CREATE TYPE papel_usuario AS ENUM ('admin','coordenador','auditor','revisor','fornecedor','leitor','cliente');
CREATE TYPE notif_tipo AS ENUM ('auditoria','erro','penalidade');
```

### 3.2 Núcleo — cadastro

```sql
CREATE TABLE organizacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL
);

CREATE TABLE projeto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizacao(id),
  codigo text NOT NULL,                 -- 'CPQ11'
  nome text NOT NULL,
  cliente text,
  cliente_contato text,
  coordenacao text,
  bep_ref text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, codigo)
);

CREATE TABLE empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizacao(id),
  nome text NOT NULL,
  cnpj text,
  tipo empresa_tipo NOT NULL DEFAULT 'terceirizada',
  contratada_por uuid REFERENCES empresa(id),   -- cadeia de subcontratação
  papeis empresa_papel[] NOT NULL DEFAULT '{}',
  ferramenta text,                              -- 'Revit' | 'Tekla'
  departamento text,
  disciplinas text,
  logo_url text,
  status text DEFAULT 'ativo',
  penalidades int DEFAULT 0
);

CREATE TABLE contato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  nome text, cargo text, email text, telefone text,
  departamento text, disciplina text
);

CREATE TABLE usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizacao(id),
  login text NOT NULL,                  -- e-mail
  nome text,
  senha_hash text,                      -- bcrypt/argon2; nulo se SSO
  papel papel_usuario NOT NULL,
  empresa_id uuid REFERENCES empresa(id),
  status text DEFAULT 'ativo',
  permissoes text[] DEFAULT '{}',
  idioma text DEFAULT 'pt',
  UNIQUE (org_id, login)
);

CREATE TABLE standard (                 -- nomenclaturas, worksets, dicionários, mapeamentos
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  nome text NOT NULL,
  tipo text NOT NULL,                   -- nomenclatura | conjunto_esperado | vocabulario | mapeamento
  referencia text
);

CREATE TABLE nomenclatura_padrao (      -- padrão validável, por segmentos
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  segmentos jsonb NOT NULL              -- [{"k":"PROJETO","vals":["CPQ11"]},{"k":"MACRO","vals":["A","C","M","S"]},...]
);

CREATE TABLE disciplina (               -- o elo: amarra projetista, auditorias, nomenclatura, áreas
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  codigo text NOT NULL,                 -- 'STRC-STEEL'
  macro macro_disc NOT NULL,
  disc text NOT NULL,
  sub text NOT NULL,
  projetista_id uuid REFERENCES empresa(id),
  checklists checklist_tipo[] NOT NULL DEFAULT '{}',
  nomenclatura_id uuid REFERENCES standard(id),
  areas text[] DEFAULT '{}',
  UNIQUE (projeto_id, codigo)
);
```

### 3.3 Critérios, checklists e modelos

```sql
CREATE TABLE criterio (                 -- canônico, reutilizável (biblioteca)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  codigo text NOT NULL,                 -- 'SATELLITE'
  nome_pt text NOT NULL,
  nome_en text NOT NULL,
  categoria text,
  nivel criterio_nivel NOT NULL,        -- modelo | elemento
  automacao automacao NOT NULL,
  standard_id uuid REFERENCES standard(id),
  parametro_esperado text,              -- ex.: BF_FIRE RATING, 4D_AREA
  criterio_aceitacao text,
  UNIQUE (projeto_id, codigo)
);

CREATE TABLE checklist_item (           -- liga criterio ao tipo de checklist (+ overrides)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  checklist checklist_tipo NOT NULL,
  criterio_id uuid NOT NULL REFERENCES criterio(id),
  ordem int,
  obrigatorio boolean DEFAULT true,
  fase text, min_lod text, min_loi text
);

CREATE TABLE modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  codigo text NOT NULL,                 -- 'CPQ11-STRC-STEEL-DATA'
  disciplina_id uuid REFERENCES disciplina(id),
  instaladora_id uuid REFERENCES empresa(id),
  modeladora_id uuid REFERENCES empresa(id),
  acc_item_id text,                     -- referência do item no ACC
  UNIQUE (projeto_id, codigo)
);

CREATE TABLE versao_modelo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES modelo(id),
  versao text NOT NULL,                 -- 'V3'
  round int,
  formato versao_formato NOT NULL,
  autoria text,                         -- 'Revit' | 'Tekla→IFC'
  acc_version text,                     -- R22 | R24
  arquivo_url text,                     -- S3
  urn text,                             -- URN do APS (Revit)
  publicado_em timestamptz,
  UNIQUE (modelo_id, versao)
);
```

### 3.4 Execução da auditoria

```sql
CREATE TABLE auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  versao_id uuid NOT NULL REFERENCES versao_modelo(id),
  checklist checklist_tipo NOT NULL,
  area text,                            -- para LOD 500 (modelo × área)
  round int,
  estado auditoria_estado NOT NULL DEFAULT 'nao_publicado',
  aprovacao_pct numeric(5,2),           -- derivado, materializado para consulta rápida
  revisado_por uuid REFERENCES usuario(id),
  publicado_em timestamptz
);

CREATE TABLE resultado_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES auditoria(id) ON DELETE CASCADE,
  criterio_id uuid NOT NULL REFERENCES criterio(id),
  status check_status NOT NULL DEFAULT 'pendente',
  origem origem_result NOT NULL DEFAULT 'manual',
  comentario text,
  itens_analisados int,
  itens_ok int,
  UNIQUE (auditoria_id, criterio_id)
);

CREATE TABLE ocorrencia (               -- "explode" um check em nível elemento
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado_id uuid NOT NULL REFERENCES resultado_check(id) ON DELETE CASCADE,
  element_id text NOT NULL,             -- ID do elemento no modelo
  detalhe text
);

CREATE TABLE evidencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resultado_id uuid NOT NULL REFERENCES resultado_check(id) ON DELETE CASCADE,
  arquivo_url text NOT NULL,
  legenda text
);

CREATE TABLE nao_conformidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES auditoria(id),
  criterio_id uuid REFERENCES criterio(id),
  descricao text,
  recomendacao text,
  elementos text,                       -- IDs afetados
  responsavel_id uuid REFERENCES empresa(id),
  prazo date,
  status text DEFAULT 'aberto'          -- aberto | em_analise | resolvido
);

CREATE TABLE comentario_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id uuid NOT NULL REFERENCES nao_conformidade(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuario(id),
  texto text,
  created_at timestamptz DEFAULT now()
);
```

### 3.5 Apontamentos, notificações, portal e trilha

```sql
CREATE TABLE apontamento (              -- issues sincronizáveis com o ACC
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  codigo text,                          -- 'AP-001'
  titulo text NOT NULL,
  modelo_id uuid REFERENCES modelo(id),
  disciplina text,
  prioridade text,                      -- alta | media | baixa
  status text DEFAULT 'aberto',
  responsavel_id uuid REFERENCES empresa(id),
  descricao text,
  acc_issue_id text                     -- id espelhado no ACC Issues
);

CREATE TABLE notificacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizacao(id),
  usuario_id uuid REFERENCES usuario(id),   -- destinatário (nulo = broadcast por papel)
  tipo notif_tipo NOT NULL,
  mensagem text NOT NULL,
  origem text,
  lida boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE penalidade (               -- ledger de penalidades (nomenclatura etc.)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id),
  motivo text NOT NULL,
  peso int DEFAULT 1,
  referencia text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE convite_cliente (          -- visibilidade por campo
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES projeto(id),
  cliente_nome text, cliente_email text,
  secoes jsonb,                         -- {"painel":true,"matriz":true,"relatorio":false,"avanco":true}
  colunas jsonb,                        -- {"code":true,"disc":true,"co":false,...}
  token text UNIQUE
);

CREATE TABLE trilha_auditoria (         -- audit log (quem mudou o quê)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  usuario_id uuid REFERENCES usuario(id),
  entidade text, entidade_id uuid,
  acao text, diff jsonb,
  created_at timestamptz DEFAULT now()
);
```

> **Views derivadas (não são tabelas de entrada):** o *painel de controle*, a *matriz LOD 500*, o *relatório de RNC* e os *KPIs* são `VIEW`s ou consultas sobre `auditoria`/`resultado_check`/`nao_conformidade`. É isso que substitui a planilha de controle.

---

## 4. API (FastAPI)

Convenção REST, JSON, paginação por cursor, `org_id` implícito no token. Endpoints principais:

| Recurso | Método · rota | Função |
|---|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` | Login (SSO/OIDC ou senha) → JWT. |
| Projetos | `GET/POST /projetos` · `GET/PATCH /projetos/{id}` | Cadastro do projeto/cliente. |
| Empresas | `GET/POST /empresas` · `PATCH /empresas/{id}` · `POST /empresas/{id}/contatos` | Projetistas, subcontratação, contatos, logo. |
| Usuários | `GET/POST /usuarios` · `PATCH /usuarios/{id}` | Login, papel, permissões. |
| Standards | `GET/POST /standards` · `GET/PUT /projetos/{id}/nomenclatura` | Padrões e o padrão de nomenclatura. |
| Nomenclatura | `POST /nomenclatura/validar` | Valida um nome → conforme/divergente; se divergir, cria `penalidade` + `notificacao`. |
| Disciplinas | `GET/POST /disciplinas` · `PATCH /disciplinas/{id}` | O elo (projetista + checklists + nomenclatura + áreas). |
| Critérios | `GET/POST /criterios` · `PATCH /criterios/{id}` | Biblioteca canônica. |
| Checklists | `GET /checklists/{tipo}` · `PUT /checklists/{tipo}/itens` | Composição de cada auditoria. |
| Modelos | `GET/POST /modelos` · `POST /modelos/{id}/versoes` | Cadastro e nova versão. |
| Ingestão | `POST /ingest/acc/webhook` · `POST /versoes/{id}/upload` | Entrada de arquivos (ACC/manual) → S3. |
| Auditoria | `POST /versoes/{id}/auditar` · `GET /auditorias/{id}` · `PATCH /resultados/{id}` | Dispara auto-auditoria; lê; ajusta status manual. |
| Publicação | `POST /auditorias/{id}/publicar` | Revisor publica o round (estado → publicado). |
| NC | `POST /auditorias/{id}/ncs` · `PATCH /ncs/{id}` | Gera/edita não-conformidade. |
| Apontamentos | `GET/POST /apontamentos` · `POST /apontamentos/{id}/sync-acc` | Issues + sync com ACC. |
| Notificações | `GET /notificacoes` · `POST /notificacoes/{id}/lida` | Central de notificações. |
| Portal cliente | `GET /portal/{token}` | Visão read-only filtrada por `convite_cliente`. |
| Export | `GET /relatorios/{modelo}/pdf` · `GET /projetos/{id}/controle.xlsx` | Relatório e controle. |
| KPIs | `GET /projetos/{id}/kpis` · `GET /projetos/{id}/scorecard` | Indicadores e placar de conformidade. |

---

## 5. Autenticação e permissões

- **Login:** OIDC/SSO (idealmente a própria identidade Autodesk, já que o time vive no ACC) com fallback de senha (hash Argon2). O mock client-side do protótipo é substituído aqui.
- **Autorização:** por papel + permissões finas (as mesmas do cadastro: `ver_painel`, `executar`, `editar_biblioteca`, `publicar`, `gerar_relatorio`, `admin_cadastro`). Middleware aplica no nível do endpoint.
- **Cliente:** papel `cliente` só acessa `GET /portal/{token}`, com os campos filtrados pelo `convite_cliente` — nunca a API interna.
- **Isolamento:** todo query builder injeta `org_id` do token (row-level security no Postgres é uma camada extra recomendada).

---

## 6. Automação — o que automatizar primeiro

A automação é o diferencial contra a planilha. Ela tem três níveis de custo; o piloto ataca os dois mais baratos, nesta ordem:

### Nível 0 — Validação de nomenclatura (implementar primeiro, custo ~zero)
Puro backend, sem tocar no modelo. Regex/segmentação contra `nomenclatura_padrao`. Ganho imediato e visível.

```python
def validar_nome(nome: str, segmentos: list[dict]) -> dict:
    partes = nome.strip().split("-")
    segs, ok = [], len(partes) == len(segmentos)
    for i, s in enumerate(segmentos):
        val = partes[i] if i < len(partes) else ""
        allow = s.get("vals") or []
        seg_ok = bool(val) and (not allow or val in allow)
        segs.append({"k": s["k"], "val": val, "ok": seg_ok})
        ok = ok and seg_ok
    return {"ok": ok, "segmentos": segs}
# se not ok: cria penalidade(empresa_responsavel) + notificacao(tipo='penalidade')
```

### Nível 1 — Auditoria de propriedades via extração (a primeira "de verdade")
Extrai propriedades por elemento e compara com o esperado. **Sem custo de token para IFC** (IfcOpenShell roda in-house). Cobre dois dos quatro arquétipos:

- **Auditoria 4D (parâmetros)** — nível elemento. Para cada elemento, verifica presença de `4D_DISCIPLINE / 4D_AREA / 4D_SUBAREA / 4D_CELL`. Falhas "explodem" em `ocorrencia` (IDs). **Recomendado como a primeira auditoria automatizada** — é a de maior volume manual hoje e a de lógica mais simples.
- **Auditoria IFC (categorias/consistência)** — compara `IfcElementAssembly` contra o dicionário e checa parâmetros compartilhados.

Pipeline do worker (IFC, 4D):

```python
import ifcopenshell

def auditar_4d(versao, checklist_itens):
    ifc = ifcopenshell.open(versao.arquivo_local)  # baixado do S3
    esperados = [c.parametro_esperado for c in checklist_itens]  # 4D_AREA, ...
    faltando = []
    for el in ifc.by_type("IfcElement"):
        psets = ifcopenshell.util.element.get_psets(el)
        presentes = {k for p in psets.values() for k in p}
        for par in esperados:
            if par not in presentes:
                faltando.append((el.GlobalId, par))
    # grava resultado_check (status), e cada faltando vira ocorrencia
    return faltando
```

Para **Revit (.rvt)**, a mesma auditoria de propriedades usa o **APS Model Derivative**: sobe o arquivo, obtém a `urn`, extrai a árvore de propriedades e roda a mesma comparação. Custo: ~0,5 token Flex por job — orçar no piloto. (O time já tem conta Autodesk; validar a migração para o developer hub / modelo Flex.)

### Nível 2 — Fora do piloto
Checagens que exigem abrir o Revit (Design Options, Warnings/sobreposições, Model Checker) ficam para a fase seguinte, via **Design Automation for Revit** (headless), que é o nível de custo mais alto.

**Resumo da recomendação:** implementar Nível 0 (nomenclatura) + a **auditoria 4D de parâmetros em IFC** como a primeira automação ponta a ponta. É barata, cobre o maior volume manual e prova a tese sem depender de tokens caros.

---

## 7. Ingestão de modelos (ACC)

1. Fornecedor sobe o modelo na pasta `MODELS` do ACC (fluxo que já existe hoje).
2. **Webhook do ACC** (ou polling agendado) notifica a plataforma de nova versão.
3. Worker de ingestão: baixa o arquivo, salva no S3, cria `versao_modelo`, dispara a auto-auditoria aplicável (definida pela `disciplina.checklists`).
4. Resultado disponível para a revisão humana da SPBIM antes de publicar o round.

Isso substitui a digitação manual de versões/rounds do protótipo pela leitura direta da fonte.

---

## 8. Roadmap sugerido do piloto

| Fase | Entrega | Semanas (estimativa) |
|---|---|---|
| 0 | Setup: repositório, CI, Postgres, auth SSO, esquema base | 1–2 |
| 1 | Cadastro completo (projeto, empresas, disciplinas, critérios, usuários) + API | 2–3 |
| 2 | Ingestão ACC + execução manual de auditoria + NC + relatório/controle | 3 |
| 3 | **Automação Nível 0 + auditoria 4D IFC automatizada** | 2–3 |
| 4 | Portal do cliente, notificações, penalidades, KPIs/scorecard | 2 |
| 5 | Piloto assistido em 1 projeto real (ex.: um sucessor do CPQ11) + ajustes | 2–4 |

---

## 9. Decisões abertas para o time

1. **FastAPI vs Django REST** — FastAPI (recomendado) ou Django se o admin pronto e o ORM maduro pesarem mais.
2. **Identidade** — SSO Autodesk (menor atrito para quem já usa ACC) vs identidade corporativa da SPBIM.
3. **Custo APS** — confirmar o orçamento de tokens Flex e a migração ao developer hub antes de depender do Model Derivative para Revit.
4. **Revisor obrigatório** — tornar a etapa de revisão (auditor → revisor → publica) um estado obrigatório do fluxo?
5. **ACC Issues** — sincronização de apontamentos é bidirecional ou só de saída no piloto?
6. **Multi-projeto** — o piloto é mono-projeto, mas o esquema já é multi-tenant; definir quando ligar o seletor de projetos.

---

*Este plano herda o modelo conceitual de `Especificacao_Plataforma_Auditoria_BIM.md` e o valida contra tudo que o protótipo (`prototipo_auditoria_bim.html`) demonstrou. O protótipo permanece como a referência visual e de fluxo para o frontend.*
