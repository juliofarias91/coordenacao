# UI Kit — padrão visual extraído do VDCity

Kit portável para levar a **linguagem visual, a estrutura de páginas e os componentes** deste sistema para outro projeto React.

Tudo aqui foi extraído do código real (`src/index.css`, `tailwind.config.js`, `src/components/ui/`, `src/sections/home/`, `src/lib/`), limpo de dependências do domínio (Supabase, auth, viewers 3D) e renomeado para prefixos neutros (`ui-*`, `ui_*`).

> A análise narrativa completa do sistema **de origem** — incluindo os três dialetos visuais que convivem lá e a dívida técnica — está em [`../../DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md). Este README é o guia de **transplante**.

---

## 1. Instalação

```bash
npm i tailwindcss@3 postcss autoprefixer clsx tailwind-merge \
      class-variance-authority framer-motion lucide-react \
      @radix-ui/react-slot react-router-dom
```

Copie para o projeto destino:

```
docs/ui-kit-export/
├── tokens.css              →  src/index.css        (ou @import nele)
├── tailwind.config.js      →  tailwind.config.js
├── lib/        (5 arquivos) →  src/lib/
├── components/ (9 arquivos) →  src/components/ui/
└── templates/  (2 arquivos) →  use como ponto de partida de cada tela nova
```

No `main.jsx`, **antes** de renderizar:

```jsx
import './index.css';
import { initTheme } from '@/lib/theme';
initTheme();                       // aplica .dark + accent salvo, escuta o SO
```

Envolva a app com `<ThemeProvider>` (`components/theme-provider.jsx`) **só se** algum componente precisar saber o tema em JS — canvas, WebGL, SVG gerado, `glassTokens()`. Quem usa apenas classes Tailwind não precisa: a classe `.dark` no `<html>` já basta.

### A decisão que você precisa tomar primeiro: preflight

No projeto de origem o **preflight do Tailwind está desligado**, para não resetar telas legadas com estilo inline. Isso tem um custo permanente: `<button>` herda fonte e fundo do navegador, e você acaba escrevendo `appearance-none border-0 bg-transparent` e `style={{ fontFamily: 'inherit' }}` em todo botão.

**Projeto novo → deixe o preflight LIGADO** (é o padrão no `tailwind.config.js` deste kit) e apague o bloco `RESET MANUAL` do `tokens.css`. Os componentes funcionam nos dois modos; os `appearance-none` sobrando ficam inofensivos.

---

## 2. A decisão estrutural central: full-bleed × card

**Toda tela nova cai numa das duas famílias.** A escolha não é estética — é o tipo de uso:

| | **Full-bleed** | **Card** |
|---|---|---|
| **Quando** | tela de **trabalho contínuo** — lista, feed, caixa de entrada, agenda, tabela de gestão, dashboard operacional | tela **pontual** — configuração, formulário, perfil, diálogo, painel de resumo |
| **Superfície** | nenhuma. Bandas separadas por `border`/`divide-border` | `rounded-2xl border border-border bg-card p-6 shadow-sm` |
| **Altura** | `calc(100vh - 3.5rem)`, sem padding de container | container centralizado (`max-w-5xl`), `p-6`, `gap-5` |
| **Régua** | sidebar 300px · cabeçalho `h-12` · barras `h-10` | `PageHeader` + cards empilhados |
| **Template** | [`templates/FullBleedPage.jsx`](templates/FullBleedPage.jsx) | [`templates/CardPage.jsx`](templates/CardPage.jsx) |

**Critério prático:** *"é tela onde se passa o dia trabalhando, ou é config/form/diálogo pontual?"*

Nenhuma das duas é dívida técnica. Card só vira problema quando envolve uma tela de trabalho contínuo — aí ele adiciona uma moldura e um scroll a mais entre o usuário e os dados que ele veio ler.

---

## 3. As regras que definem o visual

Se você levar só cinco coisas deste kit, leve estas — são elas que fazem uma tela nova "parecer do sistema":

### 3.1 Ativo é cor + peso. Nunca pílula colorida.

Item de sidebar selecionado, aba atual, breadcrumb da página atual: `text-foreground font-semibold`. Sem fundo, sem barra lateral, sem accent.

*Por quê:* numa sidebar de 25 itens, o retângulo colorido do ativo vira o elemento mais pesado da tela — sendo que ele só precisa responder "onde eu estou". O negrito responde igual e não compete com os badges de contagem nem com o conteúdo.

**Exceção deliberada:** o dock mobile (`bottom-nav.jsx`) usa largura animada para revelar o rótulo do ativo, porque no toque não existe hover para desambiguar ícones.

### 3.2 Cor é significado, não decoração

O sistema é **monocromático por padrão**. A cor entra em três lugares e só:

- **contagens e métricas** que se varre a tela procurando → `text-primary`
- **estado semântico** → os quatro tons de `TONES` (`bg-*/10 text-*`), sempre translúcidos
- **destrutivo** → `text-red-500 hover:bg-red-500/10`, em todo o sistema, sem variação

Corolário: em KPI, o **ícone** carrega o tom, o **número** fica em `text-foreground`. Uma fileira de números coloridos vira semáforo e perde-se qual valor é grande.

### 3.3 A microinteração-assinatura: rótulos que crescem

Botão nasce redondo (só ícone) e o rótulo **expande no hover**:

```
max-w-0 opacity-0  →  group-hover:max-w-[130px] group-hover:opacity-100
transition-all duration-300
```

É o que faz oito ferramentas caberem numa topbar sem virar oito ícones mudos. Aparece em `ActionPill` (topbar), `ToolBtn expand` (barras de trabalho), botões de "adicionar" das sidebars. **É a interação mais característica do produto** — se você levar uma coisa só, leve esta.

### 3.4 Só a esquerda empurra

A sidebar empurra o conteúdo (`padding-left` via `--sidebar-w`). O painel da direita (`RightDrawer`) **sobrepõe, sem escurecer e sem sombra**.

*Por quê:* se o drawer empurrasse, abri-lo reflowaria a tabela e o usuário perderia de vista a linha que estava lendo — que é justamente a linha que ele abriu no drawer. E escurecer o fundo transformaria em modal; modal é para quando o contexto atrás **não** importa.

### 3.5 Dark mode é preto neutro, não slate azulado

`--background: 0 0% 6%` / `--card: 0 0% 11%` / `--border: 0 0% 14%`. Zero saturação.

A borda a 14% fica só um degrau acima do fundo — contorno discreto. A 18% (valor comum em temas shadcn) aparece uma linha cinza destacada em volta de cada card que muda completamente a leitura da tela.

---

## 4. Escalas de referência

### Raio
```
rounded-full  pílulas, chips, avatares, botões de ação circulares
rounded-md    botões pequenos, itens de menu, skeleton
rounded-lg    inputs, botões, dropdowns          ← var(--radius) = 0.5rem
rounded-xl    cards internos, colunas de kanban, popovers
rounded-2xl   CARDS DE PÁGINA e MODAIS           ← superfície canônica
```

### Sombra
```
(nenhuma)   cards de tabela/admin — profundidade só por borda
shadow-sm   cards de conteúdo, KPIs
shadow-md   dropdowns
shadow-xl   popovers da topbar, dock mobile, drawers
shadow-2xl  modais, menus em portal
```

### Tipografia
```
base           text-sm (14px)
metadados      text-xs (12px)
micro-labels   text-[10px] / text-[11px]
labels/headers text-[11px] font-bold uppercase tracking-wide text-muted-foreground
títulos card   text-xs  font-bold uppercase tracking-wide text-muted-foreground
título página  text-xl  font-bold text-foreground
```
`truncate` em qualquer texto de largura variável. `tabular-nums` em datas e números de coluna.

### Medidas do esqueleto — a regra dos dois trilhos

A largura de uma sidebar é decidida pela **função**, nunca "no olho":

| Trilho | Largura | Para quê |
|---|---|---|
| **Navegação** | **240px** (recolhe p/ ~49px) | navegar entre seções do app |
| **Trabalho** | **300px** (redimensionável) | árvore/lista densa dentro de uma ferramenta |

```
topbar do app        h-14 (56px)   ┐ a diferença 56↔48 é HIERARQUIA proposital:
header de seção      h-12 (48px)   ┘ chrome externo > header de ferramenta
barras internas      h-10 (40px)
dock mobile          52px
drawer direito       24rem / 26rem / 28rem
popover da topbar    w-80 (320px)
```

Todos em [`lib/design-tokens.js`](lib/design-tokens.js) → `LAYOUT`.

### Movimento

Duas curvas, não catorze — em `MOTION`:

- **`tween` (easeOut, 0.2s)** — a curva dominante: sidebar, drawer, popover, troca de painel. Em dúvida, é esta.
- **`spring`** — reservado a **feedback tátil** (dock mobile, `whileTap`). Spring em layout desktop faz o chrome parecer instável.

---

## 5. Mapa dos arquivos

| Arquivo | O que traz |
|---|---|
| `tokens.css` | tokens HSL claro/escuro, scrollbars (`.thin-scroll`), classes glass, reset |
| `tailwind.config.js` | mapeamento token → utilitário, `darkMode: 'class'` |
| `lib/utils.js` | `cn()` — clsx + tailwind-merge |
| `lib/theme.js` | claro/escuro/automático + **accent dinâmico** (troca `--primary` em runtime) |
| `lib/theme-context.js` | `useIsDark()` — para componentes que pintam fora do CSS |
| `components/theme-provider.jsx` | `<ThemeProvider>` — observa a classe `.dark` e alimenta o hook acima |
| `lib/design-tokens.js` | `LAYOUT` · `Z` · `TONES` · `MOTION` · `RECIPES` · cores de status |
| `lib/glass.js` | superfície "liquid glass" para chrome sobre mapa/vídeo/canvas |
| `components/button.jsx` | 7 variantes, 4 tamanhos (CVA) |
| `components/input.jsx` | `Input`, `Label`, `Field` |
| `components/badge.jsx` | `Badge` (identidade, sólido) e `Pill` (estado, translúcido) |
| `components/app-shell.jsx` | `AppShell` · `Topbar` · `ActionPill` · `TopbarPopover` |
| `components/app-sidebar.jsx` | sidebar de navegação 240px, colapsável, grupos recolhíveis |
| `components/bottom-nav.jsx` | dock mobile flutuante |
| `components/right-drawer.jsx` | painel direito com fechamento por rota e por evento |
| `components/workspace-ui.jsx` | `ToolBtn` · `SideItem` · `Resizer` · `WorkMenu` — peças full-bleed |
| `components/page-primitives.jsx` | `PageHeader` · `Card` · `Kpi` · `Toolbar` · `EmptyState` · `Bars` · `Progress` · `DataTable` |

### Uso mínimo

```jsx
import { AppShell, ActionPill } from '@/components/ui/app-shell';
import { Bell, LayoutDashboard, Users } from 'lucide-react';

<AppShell
  brand={<span className="text-lg font-bold text-foreground">MinhaApp</span>}
  groups={[
    { items: [{ key: 'inicio', label: 'Início', icon: LayoutDashboard }] },
    { label: 'Gestão', items: [{ key: 'equipe', label: 'Equipe', icon: Users }] },
  ]}
  activeKey={secao}
  onSelect={setSecao}
  crumbs={[{ label: 'MinhaApp', onClick: () => nav('/') }, { label: 'Equipe' }]}
  actions={<ActionPill icon={Bell} label="Notificações" dot />}
>
  <MinhaSecao />
</AppShell>
```

---

## 6. Receitas — copie e cole

```jsx
// Card de página (superfície canônica)
<div className="rounded-2xl border border-border bg-card p-6 shadow-sm">

// Botão primário
<button className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">

// Input
<input className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary" />

// Label de campo / header de tabela
<p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">

// Linha de tabela clicável — realce translúcido, NÃO zebra
<tr className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-foreground/[0.03]">

// Toggle (switch)
// trilho h-6 w-11 rounded-full (on bg-primary / off bg-muted)
// knob   h-5 w-5 rounded-full bg-white deslizando

// Chrome flutuante sobre mapa/canvas
<div className="ui-glass ui-toolbar">
  <button className="ui-toolbtn is-active"><Icon className="h-4 w-4" /></button>
</div>
```

---

## 7. Ao adaptar para a sua marca

1. **Accent** — troque `DEFAULT_ACCENT` e `ACCENT_PRESETS` em `lib/theme.js`. Como o accent é aplicado em runtime sobre `--primary`, tudo que usa `bg-primary`/`text-primary`/`ring-ring` acompanha sem recompilar. Componentes que pintam fora do CSS (canvas, WebGL) escutam o evento `ui:accent`.
2. **Neutros** — se a sua marca pede escuro azulado em vez de preto, mude só `--background/--card/--popover/--muted/--border` do bloco `.dark`. Mantenha o **espaçamento entre os níveis** (6% → 11% → 14%); é ele que produz a hierarquia de superfície, não os valores absolutos.
3. **Raio** — `--radius` controla `rounded-lg/md/sm`. Os `rounded-2xl` dos cards são fixos de propósito: a superfície de página tem raio próprio, maior que o dos controles.
4. **Fonte** — o kit usa a pilha do sistema. Ao trocar por uma fonte custom, revise os `text-[10px]`/`text-[11px]`: a micro-tipografia em caixa alta é o lugar onde uma fonte diferente quebra primeiro.

## 8. O que NÃO veio junto (e por quê)

- **Componentes de domínio** — kanban de plantas, chat, árvore BIM, viewers 3D/360, minimapa com camada vetorial. São ~10 mil linhas acopladas ao negócio; o que dá para levar deles são as regras já destiladas em `lib/glass.js` e nas escalas acima.
- **Wordmark e logo 3D** (tetraedro WebGL que segue o accent) — identidade do VDCity, não padrão reutilizável. O slot `brand` do `AppShell` é onde a sua marca entra.
- **Primitivos Radix restantes** (DropdownMenu, ScrollArea, Separator, Avatar, Skeleton) — são shadcn/ui sem customização relevante. Instale via `npx shadcn@latest add` no projeto destino; eles já consomem os mesmos tokens.
- **DatePicker custom** (490px, presets, slots de 15min) — muito específico; se precisar, copie de `src/components/ui/date-picker.jsx`.
