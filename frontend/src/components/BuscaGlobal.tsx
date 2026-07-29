/** Busca global da topbar — Ctrl+K.
 *
 *  Não veio do VDCity: lá cada seção tem a própria busca e não existe uma
 *  unificada. Aqui ela procura no vocabulário desta plataforma — projeto,
 *  cliente, modelo e critério —, que é o que se procura de cabeça: "onde está
 *  o CPQ11-C-STRC", "qual era o critério de workset".
 *
 *  Consulta as rotas que já existem em vez de um endpoint novo: são listas de
 *  cadastro, pequenas, e o filtro é local. Um `/busca` no backend só se paga
 *  quando o volume não couber mais na memória do navegador.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

type Achado = {
  id: string
  tipo: 'projeto' | 'cliente' | 'modelo' | 'criterio'
  titulo: string
  detalhe: string
  /** Para onde ir ao escolher. Tudo é navegação — inclusive escolher um
   *  projeto, que agora significa entrar na URL dele. */
  ir: () => void
}

const ROTULO_TIPO: Record<Achado['tipo'], [string, string]> = {
  projeto: ['Projeto', 'Project'],
  cliente: ['Cliente', 'Client'],
  modelo: ['Modelo', 'Model'],
  criterio: ['Critério', 'Criterion'],
}

/** Acentuação e caixa fora do caminho: quem digita "criterio" quer achar
 *  "Critério". */
function normalizar(s: string): string {
  // O intervalo é U+0300–U+036F: os diacríticos que o `normalize('NFD')`
  // separa da letra. Removendo-os, "critério" e "criterio" viram a mesma
  // coisa — e quem digita rápido não põe acento.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export default function BuscaGlobal() {
  const { L } = useI18n()
  const navigate = useNavigate()
  const { projeto } = useProjeto()

  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [base, setBase] = useState<Achado[]>([])
  const [carregando, setCarregando] = useState(false)
  const [cursor, setCursor] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  // Ctrl+K de qualquer lugar. É o atalho que quem usa ferramenta de trabalho
  // tenta primeiro, antes de procurar o campo com o mouse.
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberto(true)
      }
    }
    document.addEventListener('keydown', atalho)
    return () => document.removeEventListener('keydown', atalho)
  }, [])

  useEffect(() => {
    if (!aberto) return
    campo.current?.focus()

    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const fechar = useCallback(() => {
    setAberto(false)
    setTermo('')
    setCursor(0)
  }, [])

  // Carrega uma vez por abertura. O cadastro muda devagar; recarregar a cada
  // tecla transformaria a busca numa enxurrada de requisições.
  useEffect(() => {
    if (!aberto || base.length) return
    setCarregando(true)

    const pedidos: Promise<Achado[]>[] = [
      api.projetos.listar().then((r) =>
        r.itens.map((p) => ({
          id: `projeto-${p.id}`,
          tipo: 'projeto' as const,
          titulo: `${p.codigo} · ${p.nome}`,
          detalhe: p.cliente_nome ?? '',
          ir: () => navigate(rotaProjeto(p.id, 'painel')),
        })),
      ),
      api.clientes.listar().then((r) =>
        r.itens.map((c) => ({
          id: `cliente-${c.id}`,
          tipo: 'cliente' as const,
          titulo: c.nome,
          detalhe: c.contato ?? '',
          ir: () => navigate('/'),
        })),
      ),
    ]

    // Modelo e critério são por projeto: sem um escolhido, não há o que pedir.
    if (projeto) {
      pedidos.push(
        api.modelos.listar(projeto.id).then((r) =>
          r.itens.map((m) => ({
            id: `modelo-${m.id}`,
            tipo: 'modelo' as const,
            titulo: m.codigo,
            detalhe: projeto.codigo,
            ir: () => navigate(rotaProjeto(projeto.id, `modelos/${m.id}`)),
          })),
        ),
        api.criterios.listar(projeto.id).then((r) =>
          r.itens.map((c) => ({
            id: `criterio-${c.id}`,
            tipo: 'criterio' as const,
            titulo: `${c.codigo} · ${c.nome_pt}`,
            detalhe: c.categoria ?? '',
            ir: () => navigate(rotaProjeto(projeto.id, 'criterios')),
          })),
        ),
      )
    }

    Promise.allSettled(pedidos)
      .then((rs) =>
        // `allSettled`: uma rota sem permissão para este papel não pode
        // derrubar a busca inteira — o que der certo já serve.
        setBase(rs.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))),
      )
      .finally(() => setCarregando(false))
  }, [aberto, base.length, projeto, navigate])

  const achados = useMemo(() => {
    const t = normalizar(termo.trim())
    if (!t) return []
    return base
      .filter((a) => normalizar(`${a.titulo} ${a.detalhe}`).includes(t))
      .slice(0, 12)
  }, [base, termo])

  useEffect(() => setCursor(0), [termo])

  function teclado(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return fechar()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, achados.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    }
    if (e.key === 'Enter' && achados[cursor]) {
      achados[cursor].ir()
      fechar()
    }
  }

  const rotulo = L('Buscar', 'Search')

  return (
    <div className="busca" ref={caixa}>
      <button
        type="button"
        className={`pillact${aberto ? ' on' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={`${rotulo} (Ctrl+K)`}
        aria-label={rotulo}
      >
        <span className="rot">{rotulo}</span>
        <span className="ico">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </span>
      </button>

      {aberto && (
        <div className="buscapainel">
          <div className="buscacampo">
            <input
              ref={campo}
              className="f"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={teclado}
              placeholder={L(
                'Projeto, cliente, modelo, critério…',
                'Project, client, model, criterion…',
              )}
            />
            <kbd>esc</kbd>
          </div>

          <div className="buscalista">
            {carregando && <div className="empty">{L('Carregando…', 'Loading…')}</div>}
            {!carregando && !termo.trim() && (
              <div className="empty">
                {projeto
                  ? L('Digite para buscar.', 'Type to search.')
                  : L(
                      'Digite para buscar. Escolha um projeto para incluir modelos e critérios.',
                      'Type to search. Pick a project to include models and criteria.',
                    )}
              </div>
            )}
            {!carregando && termo.trim() && achados.length === 0 && (
              <div className="empty">{L('Nada encontrado.', 'Nothing found.')}</div>
            )}

            {achados.map((a, i) => (
              <button
                key={a.id}
                type="button"
                className={`buscaitem${i === cursor ? ' on' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  a.ir()
                  fechar()
                }}
              >
                <span className="pill">{L(...ROTULO_TIPO[a.tipo])}</span>
                <span className="buscatit">{a.titulo}</span>
                {a.detalhe && <span className="mmeta">{a.detalhe}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
