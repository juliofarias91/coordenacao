import { Settings, Users, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { PageHeader, Card, KpiRow, Bars, Progress, DataTable } from '../components/page-primitives';
import { Input, Field } from '../components/input';
import { Button } from '../components/button';
import { Pill } from '../components/badge';

// ============================================================================
// TEMPLATE — PÁGINA CARD (tela pontual)
//
// USE QUANDO: configurações, formulário, perfil, painel de resumo, tela de
// administração de baixa frequência.
// NÃO USE QUANDO: é a tela onde a pessoa passa o dia → FullBleedPage.jsx.
//
// A RÉGUA:
//   container centralizado com padding · gap-5 entre blocos
//   toda superfície é `rounded-2xl border border-border bg-card p-5/6 shadow-sm`
//   um único H1 no topo (PageHeader); os títulos de card são micro-tipografia
//   NUNCA card dentro de card — se precisa aninhar, use borda simples (rounded-xl
//   border) sem bg-card, senão a hierarquia de superfície some
// ============================================================================

export default function CardPage() {
  const rows = [
    { id: 1, nome: 'Ana Souza', papel: 'Gerente', status: 'ok' },
    { id: 2, nome: 'Bruno Lima', papel: 'Colaborador', status: 'pendente' },
  ];

  return (
    // max-w-5xl: formulário não deve ocupar 2000px de largura — a linha longa
    // demais quebra a leitura e o campo de 1800px de largura parece um erro.
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <PageHeader
        icon={Settings}
        title="Configurações do projeto"
        subtitle="Preferências, membros e integrações deste projeto."
        action="Novo membro"
        onAction={() => {}}
      />

      <KpiRow items={[
        { icon: Users, label: 'Membros', value: '14', tone: 'primary' },
        { icon: Activity, label: 'Ativos hoje', value: '9', tone: 'green' },
        { icon: AlertTriangle, label: 'Pendências', value: '3', tone: 'amber' },
        { icon: CheckCircle2, label: 'Concluído', value: '82%', tone: 'green' },
      ]} />

      {/* Grid 2/3 + 1/3 — a proporção padrão de "gráfico + resumo" */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Atividade (6 meses)" className="lg:col-span-2">
          <Bars data={[30, 45, 40, 60, 55, 72]} labels={['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun']} />
        </Card>
        <Card title="Por categoria">
          <div className="flex flex-col gap-2.5">
            <Progress label="Mão de obra" value={38} hint="38%" />
            <Progress label="Materiais" value={31} hint="31%" />
            <Progress label="Serviços" value={13} hint="13%" />
          </div>
        </Card>
      </div>

      <Card title="Dados gerais">
        {/* Formulário: 2 colunas no desktop, 1 no telefone. Labels SEMPRE acima
            (label ao lado quebra em telas estreitas e desalinha a coluna). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do projeto"><Input defaultValue="Edifício Aurora" /></Field>
          <Field label="Código interno"><Input defaultValue="AUR-2026" /></Field>
          <Field label="Responsável"><Input defaultValue="ana@exemplo.com" /></Field>
          <Field label="Prazo"><Input type="date" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline">Cancelar</Button>
          <Button>Salvar alterações</Button>
        </div>
      </Card>

      <Card title="Membros">
        <DataTable
          rows={rows}
          onRowClick={() => {}}
          columns={[
            { key: 'nome', header: 'Nome', className: 'font-medium text-foreground' },
            { key: 'papel', header: 'Papel', className: 'text-muted-foreground' },
            {
              key: 'status', header: 'Status', className: 'flex-none',
              render: (r) => <Pill tone={r.status === 'ok' ? 'green' : 'amber'}>{r.status === 'ok' ? 'Ativo' : 'Pendente'}</Pill>,
            },
          ]}
        />
      </Card>

      {/* Zona de perigo: SEMPRE por último, sempre isolada num card próprio com
          borda vermelha translúcida. Botão em dangerOutline, não sólido — o
          sólido só aparece no diálogo de confirmação. */}
      <div className="rounded-2xl border border-red-500/30 bg-card p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-red-500">Zona de perigo</h3>
        <p className="mt-2 text-sm text-muted-foreground">Excluir o projeto remove todos os dados associados. Esta ação não pode ser desfeita.</p>
        <Button variant="dangerOutline" className="mt-4">Excluir projeto</Button>
      </div>
    </div>
  );
}
