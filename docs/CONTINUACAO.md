# Onde paramos — 29/07/2026

Estado da plataforma no fim do dia, o que está no ar, e o que vem a seguir.
Escrito para retomar amanhã sem reconstruir o contexto.

---

## 29/07 — rotas por projeto

O projeto saiu do `localStorage` e foi para a URL: as telas de auditoria agora
vivem em **`/projetos/:projetoId/<tela>`**. Era o item 10 da lista de ontem, e
foi feito antes das telas novas justamente para não ter de refazê-las depois.

O que isso muda na prática:

- **`/painel` significava coisas diferentes para duas pessoas** — cada uma com
  o seu projeto guardado no navegador. Agora o endereço carrega o projeto e
  **dá para mandar o link a um colega**. O "Abrir" da administração virou um
  link de verdade, que se copia e se abre noutra aba.
- **Trocar de projeto mantém a tela**: quem está no painel do CPQ11 e troca no
  breadcrumb cai no painel do outro, não numa tela inicial.
- **O breadcrumb passou a ser `cliente › projeto › tela`** — a mesma árvore que
  a home usa como pasta.
- **Os links antigos continuam funcionando.** `/painel`, `/kpis`,
  `/modelos/:id` e os outros redirecionam para o último projeto visitado, que
  é exatamente o que a URL antiga queria dizer.

Duas decisões que valem lembrar antes de mexer:

- **`selecionar()` preserva só as telas do menu.** `modelos/<id>` fica de fora
  de propósito: trocar de projeto ali levaria o id do modelo do projeto antigo
  para a URL do novo. A lista sai de `ITENS_NAV`, não é escrita à mão.
- **O `localStorage` (`spbim_projeto`) não sumiu — mudou de papel.** Não é mais
  o projeto corrente; é a memória do último visitado, que responde "qual
  projeto?" nas telas globais (home, administração) e alimenta o redirecionamento
  dos links antigos. Ele acompanha a URL, não o clique: um link recebido de
  outra pessoa também vira o "último".

`tsc`, `eslint`, `npm test` (28/28) e o build passam; o refresh direto num link
profundo foi conferido contra a API real (o catch-all do `spa.py` cobre
qualquer profundidade). **A renderização em si não foi verificada em navegador**
— não há automação de browser nesta máquina.

---

## 29/07 — a navegação remontada (etapa 1 de 2)

A estrutura do menu passou a ser a que a coordenação pediu. O que mudou de
fundo: **a sidebar é contextual**. Fora de um projeto ela mostra o que vale
para a organização; dentro, o que se faz naquele projeto, com um caminho de
volta no topo trazendo o código do projeto.

```
fora do projeto     Projetos · Apontamentos · Gestão de membros · Integrações
dentro do projeto   ← CPQ11 · Painel · KPIs
                    Auditoria: geral · 4D · LOD300 · LOD350 · LOD400 · LOD500 · Relatórios
                    Projeto: Critérios · PEB · Membros · Configurações
```

**Duas telas estavam no menu errado desde sempre, e o backend já dizia isso:**

- **Apontamentos** virou central. `projeto_id` sempre foi filtro *opcional* na
  API — era a interface que insistia em passá-lo, e o efeito era que ver as
  pendências de dois projetos exigia trocar de projeto e somar de cabeça. Agora
  lista tudo, com o projeto virando coluna e filtro. Criar continua exigindo um
  projeto: `projeto_id` é NOT NULL na tabela.
- **Integrações** subiu para o nível da organização. A tela sequer usava o
  contexto de projeto.

**As seis auditorias são uma tela só.** A matriz sempre recebeu `?checklist=`;
o painel a chamava com `lod500` fixo e os outros cinco recortes existiam na API
sem porta na interface. Viraram entradas de menu porque é assim que se
trabalha: abre-se "a LOD400", não "a matriz, e então escolhe-se LOD400".
`components/Matriz.tsx` é a tabela, compartilhada com o painel — duplicá-la
garantiria que a regra de cor divergisse na primeira mexida.

**Gestão de membros** saiu da Administração e virou `/membros`. Administração é
o que se configura uma vez; membro entra e sai o tempo todo, e estava dois
cliques abaixo do que devia.

**A busca virou barra fixa.** Era uma `.pillact` que nascia redonda. A regra
dos "rótulos que crescem" existe para caber várias ferramentas na topbar sem
virar fileira de ícones mudos — e a busca não é mais uma delas: é o atalho de
maior alcance da barra, e escondê-la fazia com que só quem já sabia do Ctrl+K a
usasse.

**Configurações da conta** (`/configuracoes`) nasceu com dados pessoais,
idioma, tema e **troca da própria senha** — que a API sempre permitiu a
qualquer usuário e a interface só oferecia a quem administra cadastros.

### Etapa 2 — o banco que faltava (migration 0004)

- **LOD300 e LOD350** entraram no enum `checklist_tipo`, **antes de `lod400`**:
  o Postgres guarda a ordem de declaração, e acrescentá-los no fim faria
  qualquer `ORDER BY` listar LOD300 depois de LOD500. As seis telas de auditoria
  passaram a responder.
- **`projeto_membro`** — vínculo usuário↔projeto com papel *nele* e função. A
  tabela **NÃO AUTORIZA**, e isso é deliberado: registra participação, e quem
  decide continua sendo `requer_permissao` sobre as permissões de organização.
  Ligar as duas coisas mudaria como as 72 rotas autorizam e é decisão à parte —
  há um teste (`test_participacao_nao_e_permissao`) que trava isso justamente
  para que a mudança seja consciente.
- Continua pendente: **preferências de notificação** (falta coluna em `usuario`).

**Um bug meu, encontrado ao aplicar a 0004 e que valia o susto.** O
`pg_advisory_lock` que eu tinha posto no `env.py` era tomado NA CONEXÃO DO
ALEMBIC — e no SQLAlchemy 2.0 o primeiro `execute()` abre uma transação
implícita. Resultado: `context.begin_transaction()` encontrava a transação já
aberta, virava no-op, e **ninguém commitava**. O `alembic upgrade head`
imprimia "Running upgrade 0003 -> 0004", saía com **código 0** e não gravava
nada. Falha silenciosa num comando que o container roda sozinho no deploy.

Corrigido de duas formas: o lock vai numa **conexão separada** (é de sessão,
sobrevive ao commit), e o `entrypoint.sh` passou a **conferir `alembic current`
contra head** depois do upgrade, em vez de confiar no código de saída.

---

## 29/07 — duas descobertas ao caçar o "sistema bugado"

**A plataforma estava vazia, e era isso.** A organização SPBIM tem 1 projeto,
1 cliente e 2 usuários — e zero empresas, disciplinas, critérios, modelos,
standards, auditorias e apontamentos. Toda tela abria legitimamente vazia.
O `scripts/dados/cpq11.yaml` tem o projeto de referência inteiro (9 empresas,
10 disciplinas, 30 critérios, 35 itens de checklist, 5 modelos) e **nunca foi
importado**. Decisão do usuário: **não importar** — o piloto vai receber dado
real, cadastrado pela própria plataforma.

A API em si está sã: 30 endpoints que as telas chamam foram exercitados com
token real, **29 passam**, e a única falha é `checklist=lod300` → 422.

**Sobraram 10 organizações de teste no banco do piloto**, de 28 e 29/07 — os
testes criam uma organização por cenário e a limpeza é pulada quando uma
asserção falha no meio. Foram apagadas (só a SPBIM restou), mas **a causa
continua**: os testes rodam contra o mesmo banco do piloto, porque é o que o
`.env` aponta. Pendência: banco de teste separado, ou limpeza à prova de falha
num fixture.

---

## 29/07 — o lote de telas que faltava

Quatro itens da lista abaixo, todos "só tela": o backend já existia e ninguém
via o dado.

- **Clientes na Administração** (item 1). A entidade nasceu em 28/07 e só se
  criava de carona, pelo "+ novo cliente…" do formulário de projeto. Agora tem
  aba própria — e é o único lugar onde se corrige o nome de um cliente, o que
  importa porque **o nome do cliente é a pasta da home**. Remover avisa quantos
  projetos ficam órfãos, em vez de um "tem certeza?" genérico.
- **Log de atividade** (item 2), na Administração. A trilha grava sozinha desde
  a Fase 4 e tinha API; faltava a tela. Filtra por entidade, ação e pessoa,
  agrupa por dia e a linha expande mostrando campo a campo. O cuidado central
  é que o `diff` **muda de formato conforme a ação** — `criou`/`removeu` trazem
  o estado inteiro, `alterou` traz `{de, para}` —, e a tela decide pela FORMA
  do valor, não pela ação, para que uma linha antiga não a derrube.
- **Central de notificações** (item 3), em `/notificacoes`, com "ver todas" no
  rodapé do sino. Não é redundante com ele: o sino é o **aviso** (aparece por
  cima e some), a central é a **caixa** (filtro por tipo, por não-lidas,
  separação por dia). Rota global, sem projeto — notificação é do usuário e do
  papel dele.
- **Política de privacidade** (item 6), em `/privacidade`, **pública**: uma
  política atrás de login informa tarde demais. Entra por lazy import — é a
  única tela de texto corrido da plataforma, e estaticamente esse texto
  viajaria no chunk principal. O conteúdo descreve o que o código realmente
  faz (RLS, trilha imutável, `ON DELETE SET NULL`, APS, Supabase). **Falta
  preencher os campos entre colchetes e passar por revisão jurídica.**

**Um bug encontrado e corrigido no caminho.** Escrevendo o primeiro teste de
`/organizacao` (o endpoint não tinha nenhum), apareceu que a guarda de slug
duplicado era **código morto**: ela fazia um `SELECT` numa sessão com RLS, que
só enxerga a própria organização, então nunca achava o slug do vizinho e
aprovava sempre — a colisão só aparecia no `UPDATE`, como 500. Agora a
constraint é que decide, e o `IntegrityError` vira 409. De quebra fecha a
corrida entre dois admins renomeando ao mesmo tempo.

`/organizacao` também passou a contar **clientes**, que ficou de fora quando a
entidade nasceu.

```
backend    16 passed  (test_organizacao novo com 5, + test_api e test_permissoes)
frontend   tsc + eslint limpos, npm test 28/28, bundle inicial 322 kB
```

Não rodei a suíte inteira do backend (são ~40 min); rodei os três arquivos que
a mudança de `/organizacao` alcança. **Nenhuma das telas foi verificada em
navegador** — não há automação de browser nesta máquina.

---

## O que mudou em 28/07

A plataforma saiu de "roda na máquina do dev contra Postgres local" para
**publicada, com banco gerenciado e um deploy funcionando**.

| | Antes | Agora |
|---|---|---|
| Banco | Postgres local (docker) | **Supabase** (PostgreSQL 17.6, us-west-2) |
| Deploy | nenhum | **Easypanel**, `hub/spbim-coordenacao` |
| Repositório | local, sem remote | `github.com/juliofarias91/coordenacao` |
| Auditer | app separado, deployado | **aposentado** — vive dentro da plataforma |
| Cliente | campo de texto em `projeto` | **entidade** (migration 0003) |
| Porta de entrada | `/painel` | **`/`** — home com pastas por cliente |

---

## O ambiente

**Local.** A máquina não tem Docker, psql nem Node global para o backend. O
Python 3.12 foi instalado hoje e a venv vive em `backend/.venv`.

```powershell
.\dev.ps1            # API :8000 + Vite :5173 com hot-reload — o de todo dia
.\dev.ps1 -Unico     # só :8000, servindo o build, igual à produção
.\dev.ps1 -Parar     # encerra as duas
```

Comandos do backend precisam do interpretador da venv pelo caminho absoluto
(`backend\.venv\Scripts\python.exe`) — o `Set-Location` nem sempre persiste
entre chamadas no PowerShell, e caminho relativo já falhou.

**Produção.** `hub/spbim-coordenacao` no Easypanel (187.77.48.26:3000), porta
**8000**, construído do `Dockerfile` da raiz. As variáveis estão no nível do
projeto `hub`. O Easypanel as passa como `--build-arg`, então **as senhas
aparecem no log de build** — vale rotacionar a senha do banco quando o
ambiente estabilizar.

**Supabase** (`pilyrmvxytuwoiwjxgdv`): o schema está na revisão **0003** e o
seed já rodou (org SPBIM, projeto CPQ11, cliente Microsoft).

---

## Três armadilhas que já custaram tempo hoje

**O host `db.<ref>.supabase.co` não serve.** Só publica registro AAAA, e o
IPv4 dedicado é add-on pago: de rede sem IPv6 o DNS resolve e o TCP nunca
fecha. O sintoma é um timeout na 5432 que parece firewall. Migration e
autenticação vão pelo **pooler em modo sessão** (`5432`, usuário
`postgres.<ref>`); a API vai pelo modo transação (`6543`).

**O dono das tabelas é `spbim_owner`, não `postgres`.** O banco foi preparado
por fora com um papel dedicado. O `postgres` era membro mas com
`inherit=false`, então tinha zero privilégios — o erro aparecia como
`permission denied for table organizacao` na conexão que deveria ser a mais
poderosa. Resolvido com `GRANT spbim_owner TO postgres WITH INHERIT TRUE, SET
TRUE` (aditivo: não trocou senha nem dono).

**O endpoint S3 é `<ref>.storage.supabase.co`**, com `.storage.` no meio — não
`<ref>.supabase.co`. Credenciais validadas contra o Storage real hoje.

---

## O que está pronto e verificado

```
backend    219 passed, 13 skipped   (suíte completa contra o Supabase, ~40min)
           os 13 skips são de storage; test_cadastro corrigido depois, 29/29
frontend   tsc + eslint limpos, build ok, bundle inicial 306 kB
```

- **Supabase**: banco, RLS validado pelos três testes de isolamento, papel de
  aplicação, `scripts/supabase_bootstrap.py` para repetir em outro ambiente.
- **Cliente como entidade**: migration 0003 com conversão dos textos, API
  completa, `GET /clientes/pastas` para a home, 8 testes.
- **Home** (`/`): KPIs e projetos em pastas por cliente, modos pastas/lista.
- **Shell**: usuário e Administração na topbar, Sair também no rodapé da
  sidebar, busca global (Ctrl+K), grupos da sidebar arrastáveis.
- **Auditer aposentado**: o motor vive em `frontend/src/lib/auditer/`.

---

## O que vem a seguir

A lista pedida, com o custo real de cada item. **Só tela** significa que o
backend já existe.

### Só tela — o backend já está pronto

1. ~~**Administração separada**~~ — **feito em 29/07**: aba de Clientes, e a
   visão geral passou a contar clientes.
2. ~~**Log de atividade**~~ — **feito em 29/07**, aba na Administração.
3. ~~**Notificações**~~ — **feito em 29/07**, central em `/notificacoes`.
4. **Perfil separado, em sections** — hoje é um painel no menu da conta.
   *(a decidir: adotar o padrão de sections do VDCity, `?s=`, ou não)*
5. **Home em sections** — a home atual é uma tela só; o VDCity divide em
   seções navegáveis (`?s=`). *(mesma decisão do item 4)*
6. ~~**Política de privacidade**~~ — **feito em 29/07**, rota pública
   `/privacidade`. **Falta preencher os campos entre colchetes (DPO, contato)
   e passar por revisão jurídica** — o texto é a descrição técnica correta do
   sistema, não um parecer.

### Precisa de backend novo

7. **Lixeira** — soft delete de verdade: `deleted_at` nas tabelas, filtro em
   toda query **e nas policies de RLS**. Hoje `DELETE` é definitivo. É a mais
   invasiva da lista: toca todas as entidades.
8. **Apontamento de erros do sistema** — tabela própria de bug report. Não
   confundir com `Apontamento`, que já existe e é de auditoria de modelo.
9. **Personalização de navbar (pins)** — precisa persistir a escolha por
   usuário; hoje só a ordem da sidebar persiste, em `localStorage`.

### Decidido, mas ainda não implementado

10. ~~**Rotas por projeto**~~ — **feito em 29/07**, ver o topo.
11. **Login/cadastro** — decidido: **só por convite do admin**. Cadastro aberto
    contradiz "SSO autentica, não provisiona" (`docs/SUPABASE.md`). O que falta
    é a tela de convite + definição de senha.

---

## Pendências operacionais

As quatro foram atacadas em 29/07. **Duas fecharam em código; duas dependem de
uma ação sua no painel** — não há como fazê-las daqui.

**Fechadas:**

- ~~**Migration no deploy**~~ — o `ENTRYPOINT` do `Dockerfile` da raiz agora
  roda `alembic upgrade head` antes de qualquer processo, para o `app` e para o
  `worker`. Falha aborta o container de propósito: subir a API contra um schema
  velho é pior do que não subir. Um `pg_advisory_lock` serializa os dois, que
  sobem juntos. (O `docker-compose.prod.yml` já tinha um serviço `migracao`
  dedicado — o buraco era só o caminho do Easypanel.)
- ~~**Readiness cego**~~ — `/health/ready` só olhava o banco, então a falta do
  Redis não aparecia em lugar nenhum. Agora relata **banco, fila e storage**.
  Responde 200 mesmo degradado, de propósito: sem fila tudo funciona menos o
  enfileiramento, e um 5xx faria o `HEALTHCHECK` derrubar a API inteira.
  **Alerte pelo campo `status`, não pelo código HTTP.**

**Ficam com você — precisam do painel:**

- **Redis**: continua não existindo no Easypanel. O que mudou é que agora a
  falta *aparece*: `/health/ready` diz `"fila": "indisponível"`. Roteiro em
  `docs/EASYPANEL.md` §3.
- **Bucket privado**: `backend/scripts/verificar_storage.py` troca "conferir no
  painel" por uma prova. `--canario` grava um objeto, tenta baixá-lo **sem
  credencial nenhuma** e exige uma recusa; apaga o objeto no fim e sai com
  código 1 se o bucket for público. **Rode antes do primeiro modelo real** —
  daqui não deu: o `.env` local aponta o S3 para o MinIO, e as chaves do
  Supabase vivem no Easypanel.
- **Senhas no log de build**: a causa é o Easypanel passar variáveis de
  **projeto** como `--build-arg`. O `Dockerfile` da raiz não declara `ARG`
  nenhum e não precisa de segredo para construir — então a correção é
  **declarar os segredos no Environment do SERVIÇO**, e rotacionar o que já
  circulou. Passo a passo em `docs/EASYPANEL.md` §6.

---

## Onde as coisas estão

| Assunto | Arquivo |
|---|---|
| Como o VDCity é aproveitado | `K:\SPBIM TECH\PLATAFORMAS\Plataforma vdcity\PLATAFORMA\vdcity` |
| Migração e armadilhas do Supabase | `docs/SUPABASE.md` |
| Deploy no Easypanel | `docs/EASYPANEL.md` |
| Runbook de produção | `docs/OPERACAO.md` |
| Linguagem visual (as cinco regras) | `ui-kit-export/README.md` e `CLAUDE.md` |
| Bootstrap de um Supabase novo | `backend/scripts/supabase_bootstrap.py` |
| Criar usuário / recuperar acesso | `backend/scripts/criar_usuario.py` |

**Sobre o VDCity:** não é copiar arquivo. Lá é JSX + Tailwind + Supabase direto
no navegador; aqui é TypeScript, classes semânticas sem Tailwind, e todo dado
passa pela API. Traz-se a estrutura e o comportamento, reescrevendo. Cuidado
com `pages/Projeto.jsx` (288 KB num arquivo só) e `AgendaSection.jsx` (121 KB):
são o que o `DESIGN_SYSTEM.md` de lá chama de dívida — pegue a ideia, não a
implementação.
