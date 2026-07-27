# Especificação da Plataforma de Auditoria BIM — Estrutura Única

Documento consolidado a partir dos insumos enviados (auditorias Geral Revit, IFC, 4D e LOD 400, planilha de controle, relatórios .docx, dicionário IFC e exemplos preenchidos). Objetivo: substituir todas as planilhas por **uma única estrutura de dados**, sobre a qual controle, resumo e relatório passam a ser telas geradas automaticamente.

---

## 1. Princípio central

Hoje existe uma planilha para cada coisa: a auditoria em si, o controle de disciplinas/versões/rounds, o resumo geral e o relatório final. O insight que organiza tudo é que **só a auditoria é dado de origem**. Controle, overview e relatório são *derivados* — consultas e exportações sobre a mesma base. Quando cada auditoria vive na plataforma:

- o **controle** (disciplinas, versões, rounds, aprovação) vira um painel vivo;
- o **overview** vira um rollup do último round aprovado por modelo;
- o **relatório .docx** vira um documento gerado sob demanda (inclusive bilíngue).

Nenhuma dessas três é mantida à mão. É assim que as planilhas somem.

---

## 2. Modelo de dados consolidado

### 2.1 Organização e projeto

| Entidade | Campos principais | Observações |
|---|---|---|
| `Projeto` | id, código (ex.: CPQ11), nome | Raiz da hierarquia |
| `Empresa` | id, nome, código, tipo | `tipo` ∈ {trade/instaladora, bim/modeladora, fornecedor}. A mesma empresa pode ter mais de um papel |
| `Disciplina` | id, código, macrodisciplina, disciplina, subdisciplina | Taxonomia em três níveis do organograma: MACRODISCIPLINA (M=MEP, S=SITE, C=CIVIL, A=ARCH) → DISCIPLINA (STRC, PLMB, ARCH…) → SUBDISCIPLINA (CONCR, STEEL, CWTD…; `NONE` quando inexistente) |
| `Area` | id, projeto_id, código, nome | Setor físico do projeto (o "SETOR" da nomenclatura): ADMIN (A), COLO1–5 (1–5), GUARDHOUSE (G), UTILITIES (U), SUBSTATION (S), YARD (Y), WASTE SHED. Combos possíveis (ex.: `A12` = ADMIN+COLO1+COLO2) |
| `Usuario` | id, nome, email, papel | Papéis na seção 4 |

O nome de arquivo segue o padrão **`PROJETO-MACRODISC-DISC-SUBDISC-SETOR-SOFTWARE`** (ex.: `CPQ11-C-STRC-CONCR-A12-R22`). O sufixo de software codifica a origem: `R22`/`R24` (Revit ano), `RX3` (IFC 2x3); é suprimido para outras ferramentas (ex.: Navisworks → `CPQ11-C-STRC-CONCR-A12`). A própria convenção é um `Standard` configurável — há uma versão vigente e uma sugestão de revisão. O responsável de execução por modelo é a `Empresa` trade.

### 2.2 Modelo e versões

| Entidade | Campos principais | Observações |
|---|---|---|
| `Modelo` | id, projeto_id, disciplina_id, empresa_trade_id, empresa_bim_id | Um modelo por disciplina/instaladora |
| `VersaoModelo` | id, modelo_id, numero (V1, V2…), arquivo, formato, autoria, acc_versao, acc_data, revit_versao | `formato` ∈ {revit, ifc}. `autoria` = ferramenta de origem (Revit, Tekla…); modelos de aço (ex.: METASA) nascem no Tekla e são entregues em IFC. Guarda a coexistência R22/R24 e a sincronização com o ACC |

### 2.3 Biblioteca de critérios (o coração configurável)

A lista de requisitos **não é hardcoded**: vira dado editável e reutilizável entre auditorias.

| Entidade | Campos principais | Observações |
|---|---|---|
| `Criterio` | id, código, nome_pt, nome_en, categoria, tipo, tipo_dado, obrigatorio, criterio_aceitacao, parametro_esperado, referencia_externa, referencia_url, standard_id | Conceito canônico, reutilizável. `criterio_aceitacao` é estruturado (uma ou várias regras) — ex.: "Browser Organization - Views" reúne nomeação em inglês, agrupamento WORK VIEW, ortografia, duplicatas e escopo. `tipo` ∈ {modelo, elemento}. `tipo_dado` ∈ {LOG/geometria, LOI/informação}. Rótulo bilíngue (relatório PT/EN). `parametro_esperado` = param nativo do Revit ou custom (ex.: `BF_FINISH`) |
| `Checklist` | id, nome, formato, fase, lod | `formato` ∈ {revit, ifc}. `fase` ∈ {geral, issue-for-construction, …}. `lod` ∈ {300, 350, 400, 500=as-built} |
| `Requisito` | id, checklist_id, criterio_id, instrucao, metodo, peso, relevancia, fase, min_lod, min_loi | Junção checklist×critério com **overrides locais**: instrução, método e peso do contexto. `fase` + `min_lod` + `min_loi` capturam que a exigência varia por etapa (Design: Mid-way/IFC; Construction: Initial Coord/Ongoing Coord/Hand over). É o que permite o mesmo critério ter texto e nível exigido diferentes por formato e fase |
| `TipoElemento` | id, nome, referencia_bimforum | Escopo da auditoria de especificação (ex.: Curtain Wall Mullions) |
| `Standard` | id, nome, tipo, conteudo, referencia_url | Padrão de referência que um critério consulta. `tipo` ∈ {vocabulário (ex.: `IfcElementAssembly`→ANCHOR/BEAM/COLUMN), mapeamento (Revit↔Tekla↔classe IFC), conjunto-esperado+nomenclatura (lista de worksets por disciplina)}. Substitui/generaliza o antigo "dicionário" |

Os critérios não são inventados: derivam de **documentos normativos** cadastrados como `Standard` — os BEP (A5.3.1 Design, A5.3.2 Construction, e a versão de fornecedores), o **A5.37 Minimum Modeling Content Requirements** (matriz disciplina × elemento × fase, com Min. LOD e Min. LOI — a fonte direta das auditorias de especificação) e as recomendações do BIM Forum. A biblioteca de critérios é populada a partir deles.

A auditoria de especificação (LOD 400/500) é rastreada por **modelo × área**: o mesmo modelo pode ter versão analisada e aprovação diferentes em ADMIN, COLO1, SITE etc. Áreas não aplicáveis ficam N/A.

### 2.4 Execução da auditoria

| Entidade | Campos principais | Observações |
|---|---|---|
| `Auditoria` | id, versao_id, checklist_id, area_id, round, auditor_id, responsavel_id, status, estado, data_inicio, data_fim, entrega_estimada, percentual_aprovacao | `area_id` opcional — preenchido nas auditorias de especificação (escopo modelo × área). `round` = número da rodada (1…N). `estado` ∈ {não publicado, publicado, desatualizado}. "Desatualizado" é calculado quando entra versão nova depois do round. `percentual_aprovacao` é campo calculado |
| `ResultadoCheck` | id, auditoria_id, requisito_id, status, origem, comentario, evidencia, total_verificado, total_falhas | `status` ∈ {aprovado, reprovado, pendente, N/A}. `origem` ∈ {manual, automatico} — **a costura da automação futura**. Contadores usados no arquétipo de elemento (4D) |
| `Ocorrencia` | id, resultado_id, element_id, descricao | Um elemento reprovado (os IDs da coluna LOCATION do 4D). Só existe em resultados nível-elemento |
| `NaoConformidade` | id, resultado_id, descricao, recomendacao, elementos[], responsavel, prazo, status | Achados que viram pendências acompanháveis. `recomendacao` = passos de correção; `elementos` = IDs afetados (mesmo em checagens nível-modelo, como satélites) |
| `ComentarioFornecedor` | id, resultado_id, autor_id, texto, data | Loop de resposta do fornecedor (coluna SUPPLIERS COMMENTS do LOD 400) |

### 2.5 Views derivadas (não são tabelas mantidas)

| View | Substitui | Deriva de |
|---|---|---|
| Painel de controle | GENERAL AUDIT - CONTROL | Modelos + versões + auditorias/rounds |
| Overview | GERAL OVERVIEW | Último round publicado por modelo |
| Matriz disciplina × área | LOD 500 - OVERVIEW | Pivô das auditorias de especificação: aprovação por (modelo, área) |
| Relatório .docx | Relatório de Auditoria | Não-conformidades (só itens reprovados) + recomendações + IDs + metodologia + tabelas de resumo |

---

## 3. Os quatro arquétipos sobre o mesmo backbone

Todos rodam em `Auditoria → Requisito → ResultadoCheck`. As diferenças são absorvidas por atributos, não por estruturas paralelas.

| Arquétipo | Fonte | `tipo` de critério | Particularidade |
|---|---|---|---|
| Geral (Revit) | Boas práticas internas | modelo | 17 itens pass/fail no nível do modelo |
| IFC (Issue for Construction) | Entrega em IFC | modelo | 7 itens; 5 compartilhados com o Geral; valida `IfcElementAssembly` contra o dicionário |
| 4D Parâmetros | Preenchimento de parâmetros | elemento | Resultado "explode" em ocorrências (IDs de elementos sem o parâmetro); agrupado por GENERAL/ADMIN/COLO1–5 |
| LOD 400 (Spec) | BIM Forum | elemento | Escopo por tipo de elemento; LOG/LOI; obrigatoriedade; parâmetro esperado; loop de fornecedor |

### Critérios compartilhados (exemplo Geral × IFC)

Model name · Shared coordinates · Satellite elements · Duplicate/overlapped · 4D shared parameters aparecem nos dois — um único `Criterio` canônico, instanciado com instruções diferentes. Isso evita duplicação e dá, de graça, relatórios do tipo "como o critério X se comporta em todas as auditorias".

---

## 4. Papéis e permissões

O LOD 400 mostra que a permissão precisa ser **por campo**, não só por tela.

| Papel | Pode editar |
|---|---|
| Coordenação/Auditor | Verificação, comentários, evidências, status do round |
| Revisor | Validação/aprovação do round (ver decisão em aberto na seção 7) |
| Fornecedor | Apenas a própria coluna de comentários (`ComentarioFornecedor`) |
| Cliente/Leitor | Somente leitura de relatórios e painéis |

Multi-tenant desde o início (cada organização isolada).

---

## 5. Saídas derivadas em detalhe

**Painel de controle** — registro por modelo com empresas, disciplina, versão (R22/R24 + ACC), responsável, prazos, status e aprovação por round, com estado publicado/não publicado/desatualizado. Gerado, não mantido.

**Relatório** — documento com seções fixas (metodologia, objetos de análise) + tabela de resumo (instaladora/disciplina/status/aprovação) + uma seção por item de verificação com o comentário e a evidência. Bilíngue PT/EN a partir dos rótulos dos critérios. Exportável em .docx.

---

## 6. Roadmap de automação

Três níveis, atribuídos por critério via o campo `metodo` do `Requisito`:

| Nível | Como | Custo | Exemplos |
|---|---|---|---|
| 1 — Extração de propriedades | APS Model Derivative (Revit) · IfcOpenShell (IFC) | Baixo / grátis no IFC | Nome do arquivo, links, modelos genéricos, parâmetros 4D, coordenadas, categorias IFC |
| 2 — Revit headless | APS Design Automation for Revit | Alto (hora de processamento) | Design Options vazio, sobreposições via Warnings, checagens de plugin (BIMprove, Model Checker) |
| 3 — Visual/manual | Julgamento humano | — | Organização de views/sheets, vista inicial, inconsistências/elementos faltando |

**Por onde começar:** a auditoria **4D** e a **IFC**. São verificação determinística de parâmetro (nível 1), a 4D já cospe os IDs prontos pra virar ocorrências, e a IFC roda de graça via IfcOpenShell sem gastar token de APS.

---

## 7. Stack recomendada

- **Backend:** Python (FastAPI ou Django) — o ecossistema BIM da automação futura é Python-first (IfcOpenShell, SDKs do APS).
- **Banco:** PostgreSQL (o modelo é relacional puro).
- **Front:** React.
- **Arquivos:** storage compatível com S3.
- **Multi-tenant** desde o início.

---

## 8. Decisões em aberto e próximos passos

1. **Fluxo de aprovação:** o auditor fecha o round sozinho, ou um revisor valida antes de publicar? (afeta os status de `Auditoria` e `ResultadoCheck`)
2. **Escopo restante:** o LOD 500 (as-built) já está ativo e é auditado hoje por modelo × área — está contemplado. Faltam confirmar se entram auditorias de disciplina específica (estrutura, MEP) e clash/interferências.
3. **Cronograma / planejamento 4D:** o controle LOD 500 traz abas de CRONOGRAMA e PLANEJAMENTO INICIAL (o 4D-tempo, ligando elementos à linha do tempo de obra). Definir se isso entra no escopo da plataforma de auditoria ou fica como integração separada.
4. **Integração ACC:** os modelos vivem no Autodesk Construction Cloud — fornecedores sobem versões semanalmente na pasta MODELS, e as saídas da auditoria vão para pastas específicas (RECORD MODEL, MODELS REPORT, RNC = relatórios de não conformidade). Definir o nível de integração: leitura de versões do ACC e publicação automática de relatórios/RNC, ou upload/download manual no início.
3. **Ponto de partida do build:** sugestão — começar pela biblioteca de critérios + execução manual da auditoria Geral de ponta a ponta, deixando controle/relatório como views desde o primeiro dia.
