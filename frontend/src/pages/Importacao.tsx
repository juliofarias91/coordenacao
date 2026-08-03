/** Importar as planilhas de auditoria e ver a média que sai delas.
 *
 *  PONTE PROVISÓRIA — ver a migration 0012 e `services/importacao_planilha.py`.
 *  Nada aqui passa pelo caminho de auditoria da plataforma: lê os .xlsx que a
 *  coordenação já preenche à mão e alimenta este dashboard e mais nada.
 *
 *  A TELA TEM UM ARGUMENTO, e ele é o produto inteiro em miniatura: a coluna
 *  "declarado" ao lado de "recontado". Numa das oito planilhas reais a fórmula
 *  do Excel é `=COUNTIF(I6:I33, TRUE)/COUNTA(I6:I65)` — alguém acrescentou
 *  linhas e arrastou só metade da conta, e a planilha declara 30% onde o certo
 *  é 60%. A auditoria estava certa; a CONTA sobre ela é que estava errada. É
 *  exatamente o que a plataforma existe para acabar, e por isso a divergência é
 *  mostrada, não escondida.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth } from '@/auth/AuthContext'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type {
  DashboardImportacao,
  FatiaImportacao,
  RecusaImportacao,
} from '@/lib/types'

const NUVEM =
  'M12 13v8M8 17l4 4 4-4M20.9 18.4A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.2'
const LIXO = 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6'
const ALERTA =
  'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'

function Icone({ path, tam = 18 }: { path: string; tam?: number }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

const ROTULO_TIPO: Record<string, [string, string]> = {
  geral: ['Auditoria geral', 'General audit'],
  lod300: ['LOD 300', 'LOD 300'],
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`
}

/** A cor de uma taxa de aprovação. Regra 2: cor é significado — e aprovação é
 *  justamente a métrica que se varre a tela procurando. Os cortes são os do
 *  resto da plataforma. */
function tomDaTaxa(v: number | null): string {
  if (v === null) return 'na'
  if (v >= 0.8) return 'ok'
  if (v >= 0.5) return 'wait'
  return 'bad'
}

export default function Importacao() {
  const { L } = useI18n()
  const { pode } = useAuth()

  const [dados, setDados] = useState<DashboardImportacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [recusadas, setRecusadas] = useState<RecusaImportacao[]>([])
  const [sobre, setSobre] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const podeImportar = pode('admin_cadastro')

  const recarregar = useCallback(async () => {
    try {
      setDados(await api.importacao.dashboard())
      setErro(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  const enviar = useCallback(
    async (arquivos: File[]) => {
      // O `.xlsx` é o único que o leitor abre; filtrar aqui evita uma ida ao
      // servidor para receber "não é Excel" de volta.
      const planilhas = arquivos.filter((a) => a.name.toLowerCase().endsWith('.xlsx'))
      if (!planilhas.length) {
        setErro(L('Selecione arquivos .xlsx.', 'Select .xlsx files.'))
        return
      }
      setEnviando(true)
      setErro(null)
      try {
        const r = await api.importacao.enviar(planilhas)
        setRecusadas(r.recusadas)
        await recarregar()
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : String(e))
      } finally {
        setEnviando(false)
      }
    },
    [L, recarregar],
  )

  async function remover(id: string) {
    try {
      await api.importacao.remover(id)
      await recarregar()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    }
  }

  if (carregando) return <div className="hint">{L('Carregando…', 'Loading…')}</div>

  const vazio = !dados || dados.planilhas.length === 0

  return (
    <>
      <Erro mensagem={erro} />

      {/* A ÁREA DE SOLTAR É A PRIMEIRA COISA DA TELA. Sem planilha importada não
          há dashboard nenhum, e com planilha importada o gesto seguinte é
          importar a próxima disciplina — nos dois casos ela é o que se procura
          primeiro. */}
      {podeImportar && (
        <div
          className={`imp-solta${sobre ? ' sobre' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setSobre(true)
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault()
            setSobre(false)
            enviar(Array.from(e.dataTransfer.files))
          }}
          onClick={() => entrada.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && entrada.current?.click()}
        >
          <Icone path={NUVEM} tam={26} />
          <b>
            {enviando
              ? L('Lendo as planilhas…', 'Reading the spreadsheets…')
              : L('Solte as planilhas aqui', 'Drop the spreadsheets here')}
          </b>
          <span className="hint" style={{ margin: 0 }}>
            {L(
              'Vários arquivos de uma vez. Um arquivo pode trazer as duas auditorias — a geral e a de LOD 300 — e as duas entram. Reimportar a mesma disciplina substitui a anterior.',
              'Several files at once. One file may carry both audits — general and LOD 300 — and both are imported. Re-importing the same discipline replaces the previous one.',
            )}
          </span>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".xlsx"
            hidden
            onChange={(e) => {
              enviar(Array.from(e.target.files ?? []))
              // Zera o valor: sem isso, escolher o MESMO arquivo de novo não
              // dispara `change` e a reimportação parece não funcionar.
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* O que não entrou, e por quê. Fica na tela em vez de num alerta que
          some: são catorze arquivos, e saber qual falhou é o que permite
          corrigir só ele. */}
      {recusadas.length > 0 && (
        <div className="card imp-recusas">
          <div className="imp-recusa-cab">
            <Icone path={ALERTA} tam={16} />
            {L('Não entraram', 'Not imported')}
          </div>
          {recusadas.map((r) => (
            <div key={r.arquivo} className="imp-recusa">
              <b>{r.arquivo}</b>
              <span>{r.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {vazio ? (
        <Vazio
          titulo={L('Nenhuma planilha importada', 'No spreadsheet imported')}
          texto={L(
            'Suba os arquivos “… AUDITORIA GERAL .xlsx” para ver as médias por disciplina e os itens que mais reprovam.',
            'Upload the “… AUDITORIA GERAL .xlsx” files to see averages per discipline and the most-failed items.',
          )}
        />
      ) : (
        <>
          <div className="kpi-fila">
            <Numero
              rotulo={L('Aprovação geral', 'Overall approval')}
              valor={pct(dados.total.aprovacao)}
              tom={tomDaTaxa(dados.total.aprovacao)}
            />
            <Numero
              rotulo={L('Planilhas', 'Spreadsheets')}
              valor={String(dados.total.planilhas)}
            />
            <Numero
              rotulo={L('Itens auditados', 'Audited items')}
              valor={String(dados.total.itens)}
            />
            <Numero
              rotulo={L('Reprovados', 'Failed')}
              valor={String(dados.total.itens - dados.total.aprovados)}
            />
          </div>

          <div className="imp-colunas">
            <Bloco titulo={L('Por auditoria', 'By audit')}>
              {dados.por_tipo.map((f) => (
                <Barra
                  key={f.rotulo}
                  rotulo={L(...(ROTULO_TIPO[f.rotulo] ?? [f.rotulo, f.rotulo]))}
                  fatia={f}
                  L={L}
                />
              ))}
            </Bloco>

            {/* ORDENADO DO PIOR PARA O MELHOR (o backend já entrega assim): a
                pergunta de quem abre é "quem está pior", não "quem vem antes no
                alfabeto". */}
            <Bloco titulo={L('Por disciplina', 'By discipline')}>
              {dados.por_disciplina.map((f) => (
                <Barra key={f.rotulo} rotulo={f.rotulo} fatia={f} L={L} />
              ))}
            </Bloco>
          </div>

          {dados.criticos.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="sectitle" style={{ padding: '14px 16px 0' }}>
                {L('O que mais reprova', 'Most-failed items')}
              </div>
              <p className="hint" style={{ padding: '0 16px' }}>
                {L(
                  'Itens que reprovam em mais de uma planilha. É a pergunta que nenhuma planilha isolada responde — e a razão de juntá-las.',
                  'Items that fail in more than one spreadsheet. This is the question no single spreadsheet answers — and the reason to bring them together.',
                )}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{L('Item', 'Item')}</th>
                    <th>{L('Auditoria', 'Audit')}</th>
                    <th style={{ textAlign: 'right' }}>{L('Reprova em', 'Fails in')}</th>
                    <th style={{ textAlign: 'right' }}>{L('Taxa', 'Rate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.criticos.map((c) => (
                    <tr key={`${c.tipo}:${c.item}`}>
                      <td>{c.item}</td>
                      <td className="mmeta">
                        {L(...(ROTULO_TIPO[c.tipo] ?? [c.tipo, c.tipo]))}
                      </td>
                      <td className="num">
                        {c.reprovacoes}/{c.ocorrencias}
                      </td>
                      <td className="num">
                        <b style={{ color: `var(--${tomDaTaxa(1 - c.taxa)})` }}>
                          {pct(c.taxa)}
                        </b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card" style={{ marginTop: 16 }}>
            <div className="sectitle" style={{ padding: '14px 16px 0' }}>
              {L('Planilhas importadas', 'Imported spreadsheets')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>{L('Disciplina', 'Discipline')}</th>
                  <th>{L('Auditoria', 'Audit')}</th>
                  <th>{L('Modelo', 'Model')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Itens', 'Items')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Recontado', 'Recounted')}</th>
                  <th style={{ textAlign: 'right' }}>{L('Na planilha', 'In the file')}</th>
                  {podeImportar && <th />}
                </tr>
              </thead>
              <tbody>
                {dados.planilhas.map((p) => {
                  // Divergência real, com folga de 1 ponto para arredondamento.
                  const diverge =
                    p.aprovacao !== null &&
                    p.aprovacao_declarada !== null &&
                    Math.abs(p.aprovacao - p.aprovacao_declarada) > 0.01
                  return (
                    <tr key={p.id}>
                      <td>
                        <b>{p.disciplina}</b>
                      </td>
                      <td className="mmeta">
                        {L(...(ROTULO_TIPO[p.tipo] ?? [p.tipo, p.tipo]))}
                      </td>
                      <td className="mmeta">{p.modelo ?? '—'}</td>
                      <td className="num">
                        {p.aprovados}/{p.itens}
                      </td>
                      <td className="num">
                        <b style={{ color: `var(--${tomDaTaxa(p.aprovacao)})` }}>
                          {pct(p.aprovacao)}
                        </b>
                      </td>
                      {/* A COLUNA QUE JUSTIFICA A TELA. Quando as duas
                          divergem, a fórmula do Excel está errada — e mostrar
                          isso vale mais do que qualquer outro número aqui. */}
                      <td className="num">
                        {diverge ? (
                          <span className="pill alerta" title={L(
                            'A fórmula da planilha não confere com as linhas dela.',
                            'The file’s own formula disagrees with its rows.',
                          )}>
                            {pct(p.aprovacao_declarada)}
                          </span>
                        ) : (
                          <span className="mmeta">{pct(p.aprovacao_declarada)}</span>
                        )}
                      </td>
                      {podeImportar && (
                        <td className="num">
                          <button
                            type="button"
                            className="btn sm danger"
                            onClick={() => remover(p.id)}
                            title={L('Remover', 'Remove')}
                          >
                            <Icone path={LIXO} tam={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className={`kpi${tom ? ` k-${tom}` : ''}`}>
      <span className="kpi-rot">{rotulo}</span>
      {/* Regra 2: o tom vai no marcador da esquerda (`k-*`) e o NÚMERO fica em
          `--ink`. Uma fileira de números coloridos vira semáforo. */}
      <span className="kpi-num">{valor}</span>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card imp-bloco">
      <div className="sectitle">{titulo}</div>
      {children}
    </div>
  )
}

function Barra({
  rotulo,
  fatia,
  L,
}: {
  rotulo: string
  fatia: FatiaImportacao
  L: (pt: string, en: string) => string
}) {
  const v = fatia.aprovacao ?? 0
  return (
    <div className="imp-barra">
      <div className="imp-barra-top">
        <b>{rotulo}</b>
        <span className="mmeta">
          {fatia.aprovados}/{fatia.itens} {L('itens', 'items')}
        </span>
        <span className="imp-barra-num">{pct(fatia.aprovacao)}</span>
      </div>
      <div className="imp-trilho">
        <div
          className="imp-preenche"
          style={{ width: `${v * 100}%`, background: `var(--${tomDaTaxa(fatia.aprovacao)})` }}
        />
      </div>
    </div>
  )
}
