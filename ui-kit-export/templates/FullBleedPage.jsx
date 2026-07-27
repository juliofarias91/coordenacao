import { useState } from 'react';
import { PanelLeft, Search, Plus, Filter, Download, Trash2 } from 'lucide-react';

import { cn } from '../lib/utils';
import { LAYOUT, RECIPES } from '../lib/design-tokens';
import { ToolBtn, SideItem, Resizer, WorkMenu, ROUND, ROUND_OFF, ROUND_ON } from '../components/workspace-ui';

// ============================================================================
// TEMPLATE — PÁGINA FULL-BLEED (tela de trabalho contínuo)
//
// USE QUANDO: é a tela onde a pessoa passa o dia — lista, feed, caixa de
// entrada, agenda, dashboard operacional, tabela de gestão.
// NÃO USE QUANDO: é config, formulário, perfil, diálogo → use CardPage.jsx.
//
// O critério é o TIPO DE USO, não estética. Card não é dívida técnica quando a
// tela é do tipo certo para ele.
//
// A RÉGUA (copie exatamente):
//   altura calc(100vh - 3.5rem) · sem container, sem padding de página
//   sidebar 300px com busca h-7 no topo de uma barra h-12
//   header do main h-12 · barras internas h-10
//   bandas separadas por border/divide, NUNCA por card dentro de card
//   monocromático: cor só em (a) contagens, (b) tons semânticos de estado
// ============================================================================

export default function FullBleedPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarW, setSidebarW] = useState(LAYOUT.sidebarWork);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('todos');
  const [menu, setMenu] = useState(null);
  const [filterOn, setFilterOn] = useState(false);

  const groups = [
    { key: 'todos', label: 'Todos os itens', count: 128 },
    { key: 'meus', label: 'Meus', count: 12 },
    { key: 'arquivados', label: 'Arquivados', count: 40 },
  ];
  const rows = [
    { id: 1, nome: 'Primeiro registro', dono: 'ana@exemplo.com', data: '12/03/2026' },
    { id: 2, nome: 'Segundo registro', dono: 'bruno@exemplo.com', data: '11/03/2026' },
  ];

  return (
    <div className="flex" style={{ height: LAYOUT.pageHeight }}>
      {/* ---------- SIDEBAR DE TRABALHO (300px, redimensionável) ---------- */}
      {!collapsed && (
        <>
          <aside className="flex shrink-0 flex-col border-r border-border bg-background" style={{ width: sidebarW }}>
            {/* Barra da sidebar: MESMA h-12 do header do main, para as duas linharem */}
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2.5">
              <div className={RECIPES.searchPill}>
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              {/* Botão que cresce no hover — o gesto de "adicionar" do sistema */}
              <button
                type="button"
                title="Novo item"
                className="group flex h-7 w-7 shrink-0 appearance-none items-center justify-center gap-0 overflow-hidden rounded-full border border-border bg-muted/40 px-0 text-primary transition-all hover:w-auto hover:gap-1.5 hover:bg-muted hover:px-2.5"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-all duration-300 group-hover:max-w-[100px] group-hover:opacity-100">
                  Novo item
                </span>
              </button>
            </div>

            <nav className="thin-scroll flex flex-col gap-0.5 overflow-y-auto px-2 py-2">
              {groups.map((g) => (
                <SideItem
                  key={g.key}
                  label={g.label}
                  badge={g.count}
                  active={selected === g.key}
                  onClick={() => setSelected(g.key)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({
                      x: e.clientX, y: e.clientY,
                      items: [
                        { label: 'Renomear', onClick: () => {} },
                        { sep: true },
                        { label: 'Excluir', icon: Trash2, danger: true, onClick: () => {} },
                      ],
                    });
                  }}
                />
              ))}
            </nav>
          </aside>
          <Resizer width={sidebarW} min={240} max={520} onChange={setSidebarW} />
        </>
      )}

      {/* ---------- MAIN ---------- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header h-12: toggle · título · métrica · ações */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-2 pr-4">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Mostrar painel' : 'Recolher painel'}
            className={cn(ROUND, collapsed ? ROUND_ON : ROUND_OFF)}
          >
            <PanelLeft className="h-4 w-4 shrink-0" />
          </button>

          <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight text-foreground">
            {groups.find((g) => g.key === selected)?.label}
          </h2>

          <span className="shrink-0 text-xs text-muted-foreground">{rows.length} registro(s)</span>

          {/* `active` marca o filtro LIGADO. Sem isso, lista filtrada e lista
              vazia são visualmente idênticas. */}
          <ToolBtn icon={Filter} label="Filtrar" expand active={filterOn} onClick={() => setFilterOn((v) => !v)} />
          <ToolBtn icon={Download} label="Exportar" expand onClick={() => {}} />
        </div>

        {/* Corpo rolável. min-h-0 é obrigatório: sem ele o flex item não encolhe
            e a tabela vaza para fora da viewport em vez de rolar. */}
        <div className="thin-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className={cn('border-b border-border', RECIPES.tableHead)}>
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Responsável</th>
                <th className="px-4 py-2.5">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={RECIPES.rowHover} onClick={() => {}}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.nome}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{r.dono}</td>
                  {/* tabular-nums: datas e números alinham coluna a coluna */}
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{r.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <WorkMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
