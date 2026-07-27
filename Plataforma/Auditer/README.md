# Auditer

Plataforma local (sem login, sem servidor) para auditar arquivos em três eixos:

1. **Nomenclatura** — confere se o nome segue um padrão definido por você (qualquer arquivo: PDF, Excel, DWG…).
2. **Duplicidade** — encontra arquivos que colidem no ACC, inclusive o caso `X.pdf` vs `X.xlsx.pdf` (mesmo documento renomeado sem tirar a extensão antiga).
3. **Ortografia** — nos Excel, confere o conteúdo das células e os nomes das abas contra um dicionário pt-BR (Hunspell/VERO, o mesmo do LibreOffice).

Tudo roda no navegador: **os arquivos não saem do computador**.

## Como rodar

```bash
npm install     # instala e copia o dicionário para public/dictionaries
npm run dev     # sobe em http://localhost:5173
```

Não há nada mais a configurar. O `npm install` roda um `postinstall` que copia o
dicionário pt-BR (`.aff`/`.dic`, ~5,5 MB) de `node_modules/dictionary-pt` para
`public/dictionaries/` — de onde o corretor o carrega em runtime.

Para gerar a versão de produção: `npm run build` (saída em `dist/`), e
`npm run preview` para servi-la.

> No `npm run build` aparece um aviso do rolldown sobre `nanoid` em
> `emscripten-wasm-loader`. É inofensivo: aquele `nanoid()` só roda quando um
> arquivo é montado sem nome, e o corretor sempre monta o dicionário com nome
> explícito. O build funciona normalmente.

## As duas páginas

### Auditoria (`/`)
Solte um ou mais arquivos (a pasta inteira do ACC, se quiser). Cada arquivo vira
um cartão com:
- **Nome** conferido contra o melhor padrão que casa, com erro por bloco
  ("Segmento 3: COL9 não está na lista").
- **Duplicado** quando o nome colide com outro arquivo enviado.
- **Ortografia** (só Excel) — cada palavra suspeita com localização (`Aba!Célula`),
  o trecho destacado e sugestões.

Botões **Aceitar** adicionam uma palavra à lista de exceções (reenvie o arquivo
para reauditar). **Relatório CSV** baixa tudo num arquivo que abre no Excel com
acentos corretos (UTF-8 com BOM).

### Padrões (`/padroes`)
Monte o nome esperado em **blocos**, sem escrever expressão regular. **Cada bloco
tem seu próprio separador** — é isso que permite estruturas com separadores
misturados numa linha só, como a convenção ACC:

```
Spec Audit LOD400-COL1_PLMB-PLMB-DATA.pdf
└─texto fixo─┘└nº┘ └lista┘ └A┘ └B┘ └tipo┘.pdf
   (colado)    -     _      -    -
```

| Tipo | Confere |
|---|---|
| Texto fixo | um literal exato (pode conter espaços) |
| Lista de valores | um de N valores (ex.: `ADMN`, `COL1`, …) |
| Data | formato **e** se a data existe (rejeita `20260231`) |
| Número | dígitos, com contagem exata opcional |
| Texto livre | conjunto de caracteres e tamanho |
| Qualquer coisa | qualquer conteúdo não vazio |

O botão **Modelo ACC** cria de uma vez os três padrões da convenção mostrada
(Spec Audit / 4D Parameter Audit / Relatório de Auditoria) já preenchidos e
editáveis. Um **testador ao vivo** valida um nome enquanto você monta o padrão.
Os padrões ficam salvos no navegador; **Exportar/Importar** os move em JSON.

### Duplicidade e extensão dupla
Pensado para o ACC: um arquivo `... DATA.xlsx.pdf` é sinalizado com **extensão
dupla** (foi renomeado sem tirar o `.xlsx`), e como normalmente convive com o
`... DATA.pdf` correto, os dois aparecem como **duplicados** — o par que geraria
conflito ou versão indevida na hora do upload.

## Arquitetura

```
src/
  lib/
    patterns.js       modelo de padrão por blocos + validação (testado)
    excel.js          extração de texto do .xlsx (SheetJS)
    useSpellChecker.js hook que mantém 1 worker vivo por sessão
    storage.js        persistência dos padrões em localStorage
    theme.js, cn.js   tema (dark/light) e utilitário de classes
  workers/
    spell.worker.js   Hunspell em WebAssembly, fora da thread da UI
  components/, pages/  UI no design system VDCity (shadcn/tokens)
scripts/copy-dict.mjs  copia o dicionário para public/ no install
```

### Por que WebAssembly e não JS puro

O dicionário pt-BR tem **312 mil radicais**. A biblioteca em JS puro (`nspell`)
foi medida com este mesmo dicionário e leva ~45 s e mais de 2 GB de heap só para
construir — inviável no navegador. O Hunspell compilado em WebAssembly
(`hunspell-asm`) faz o mesmo em **~1 s com ~8 MB**, com a mesma precisão. Por isso
o corretor roda sobre WASM, dentro de um Web Worker para não travar a interface.
```
```

### Limitação conhecida do dicionário

O dicionário VERO tem prefixos produtivos que aceitam algumas formas estranhas
(ex.: `projeito` = `pro` + `jeito`). É o mesmo dicionário do LibreOffice — a
limitação é dele, não da ferramenta. Erros comuns de digitação são pegos
normalmente.
