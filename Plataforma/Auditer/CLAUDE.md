# Auditer — notas para o Claude

App React/Vite 100% client-side que audita planilhas Excel: ortografia (conteúdo
de células + nomes de abas) e nomenclatura de arquivo. Sem backend, sem login.

## Comandos
- `npm run dev` — dev server (roda `copy-dict.mjs` antes)
- `npm run build` / `npm run preview` — produção
- Testes da lógica de padrões: não há runner configurado; a validação foi feita
  por script ad-hoc. Se for mexer em `src/lib/patterns.js`, teste os casos de
  data (mês 13, 29/02 em ano não bissexto) e a contagem de segmentos.

## Decisões que não são óbvias no código
- **Corretor em WebAssembly, não JS.** `nspell` (JS puro) não aguenta o pt-BR
  completo (312k radicais → ~45 s, >2 GB). Trocado por `hunspell-asm` (~1 s, ~8 MB).
  Não reintroduza nspell.
- **Alias em `vite.config.js`** aponta `hunspell-asm` para o build CJS. O build
  ESM faz `import * as runtime` de um arquivo CommonJS e quebra sob o interop do
  Vite (`runtimeModule is not a function`). Não remova o alias.
- **Corretor bilíngue (pt-BR + inglês).** As planilhas do ACC misturam português
  e termos técnicos em inglês, então o worker carrega DOIS hunspell (`pt_BR` +
  `en_US`) e uma palavra só é erro quando falha nos dois idiomas. O inglês é
  opcional: se `en_US.*` não carregar, o worker degrada para só-pt em vez de
  derrubar a auditoria. Sugestões vêm do pt primeiro, completadas com o inglês.
  **Cada idioma tem sua PRÓPRIA instância wasm** (`loadModule()` por idioma): uma
  única instância com dois `create()` funciona no Node mas some silenciosamente sob
  o build CJS do hunspell no browser. O worker reporta os idiomas carregados no
  `ready` (`{langs}`) e a UI mostra isso — falha do inglês vira aviso, não mistério.
- **Filtro de ruído (`shouldSkip`).** Pula: token com dígito, palavra na lista de
  aceitas, `camelCase`, e **qualquer token TODO em maiúsculas** (PLMB, BLACKBOX,
  ANALYSING, EPMS-DEVS-DATA-R). Nas planilhas do ACC, CAPS é sempre rótulo/sigla/
  código/nome de arquivo, nunca prosa — auditar isso só gerava ruído (o corretor
  sugeria português para termo técnico em inglês, tipo `BLACKBOX → BOLACHÃO`, e
  ainda acusava pedaços de nome de arquivo). **Antes havia um corte em 5 letras**
  para tentar pegar palavras pt em CAPS sem acento (`VALIDACAO`); foi removido em
  favor de zerar o falso-positivo, que na prática do usuário era muito pior (>600
  ocorrências numa planilha). Tradeoff aceito: palavra pt em CAPS sem acento agora
  escapa. Minúsculas sem acento (`unica`, `opcoes`) continuam sendo apontadas — é
  erro real. Se um dia quiser recuperar o `VALIDACAO`, o caminho é pular CAPS só
  quando `sem vogal` OU numa lista explícita de códigos do domínio.
- **Extensões e nomes de software.** O laço de `check` pula todo token **colado
  logo depois de um ponto** (`…R24.nwc`, `arquivo.txt`, `www.site`) — extensão/
  caminho/domínio não é prosa. E `DOMAIN_WORDS` inclui os softwares BIM (Revit,
  Navisworks, Autodesk, …) e extensões soltas (`nwc`, `ifc`, …). Se surgir outro
  nome de software acusando erro, adicione ali.
- **Exportação em `src/lib/report.js`** (`downloadAuditReport`): gera uma planilha
  de auditoria (Resumo/Ortografia/Nomes) fixando cada erro na célula exata. NÃO
  reescreve o arquivo original de propósito — o SheetJS CE não preserva dropdowns,
  tabelas nem PROCV ao regravar, e as planilhas do usuário dependem disso.
- **Dicionários ficam em `public/dictionaries/`** (fora do bundle), copiados no
  install por `scripts/copy-dict.mjs` a partir de `dictionary-pt` (→ `pt_BR.*`) e
  `dictionary-en` (→ `en_US.*`). São lidos via `fetch` dentro do worker. O
  `dictionary-pt-br` do npm é um stub vazio deprecado.
- **Efeitos de persistência em `App.jsx` usam corpo com chaves** de propósito:
  `savePatterns` retorna boolean e o React trataria o retorno como cleanup.
- **`cn.js` usa `tailwind-merge`** — necessário para `w-auto` local vencer o
  `w-full` do input base.

## Padrões de nome (o modelo)
`src/lib/patterns.js` é o núcleo. Um padrão é uma lista de segmentos tipados
(literal/list/date/number/text/any); **cada segmento tem seu próprio `sep`** (o
separador que o liga ao anterior), o que expressa estruturas com separadores
misturados numa linha (ex.: `Spec Audit LOD400-COL1_PLMB-PLMB-DATA.pdf`).

- `validateName` valida por **caminhada ancorada** (um cursor anda pelo nome
  consumindo `sep` + segmento), dando erro por bloco. A regex (`patternToRegex`) é
  só para preview/export — não é a fonte da verdade.
- `matchBestPattern` escolhe o padrão de menos erros quando nenhum casa.
- `findDuplicates` detecta colisão de nome, incluindo `X.pdf` vs `X.xlsx.pdf`
  (remove extensão de escritório interna antes de comparar).
- `findContentDuplicates` detecta CÓPIA por conteúdo (mesmo hash SHA-256, nomes
  diferentes) — o caso que a duplicidade por nome não pega. O hash sai de
  `src/lib/hash.js` (Web Crypto), calculado em `Auditoria.auditFile` a partir do
  arrayBuffer já lido para o SheetJS. Sem `crypto.subtle` (http puro fora de
  localhost) o hash vira null e a detecção por conteúdo só se desativa — nome e
  ortografia seguem. Na UI: badge "cópia" e "Conteúdo idêntico a: …".
- `normalizePattern` migra o formato antigo (um `delimiter` global) para `sep` por
  segmento; chamado em `storage.loadPatterns` e defensivamente na validação.
- `accPresetPatterns()` gera os 3 padrões da convenção do usuário (botão "Modelo ACC").
- Extensão dupla (`.xlsx.pdf`) é detectada em `splitName`/`validateName`.

Teste de referência: `npm test` (roda `tests/naming.test.mjs`) valida nomes reais
do usuário + negativos + duplicidade + exemplos gerados ("19 passaram, 0 falharam").

## Escopo por tipo de arquivo
A auditoria de **nome** e **duplicidade** vale para QUALQUER arquivo (o Dropzone
aceita tudo). A **ortografia** só roda em `.xlsx/.xlsm/.xls` (via SheetJS) e sua
falha nunca invalida a auditoria de nome — ver `auditFile` em `pages/Auditoria.jsx`.

## Corretor: robustez do worker
`useSpellChecker` recria o worker até 3× com backoff em falha de init (cura a
corrida do otimizador do Vite e chunk obsoleto após reiniciar o dev server) e
expõe o erro REAL (arquivo/linha) + botão "Tentar novamente", em vez de uma
mensagem genérica. Distingue "dicionário 404" de "módulo falhou".

## Estilo visual
Segue o design system VDCity (shadcn/tokens): tokens HSL em `src/index.css`, dark
neutro (preto/cinza, não slate), cards `rounded-2xl border bg-card shadow-sm`,
badges com tons semânticos (`emerald`/`amber`/`red`), estado ativo por cor+peso.
Tema via classe `.dark` + `localStorage('spbim_theme')`.
