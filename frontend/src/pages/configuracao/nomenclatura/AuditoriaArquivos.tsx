/** Auditoria de arquivos — portada do Auditer.
 *
 *  Roda 100% no navegador: nada é enviado para a API. Confere três coisas que
 *  a automação do servidor não cobre hoje —
 *    · nome contra os padrões avançados (separador por bloco, tipos);
 *    · duplicidade por nome E por conteúdo (SHA-256), que pega a cópia salva
 *      com outro nome;
 *    · ortografia das planilhas (pt-BR + inglês, Hunspell em WebAssembly).
 *
 *  A auditoria de nome nunca depende do corretor: se o dicionário não subir, o
 *  nome continua sendo conferido. É o eixo que evita conflito no ACC.
 */
import { useCallback, useMemo, useState } from 'react'

import { useI18n } from '@/i18n'
import { extractTexts } from '@/lib/auditer/excel'
import { sha256 } from '@/lib/auditer/hash'
import {
  checkFilenameHygiene,
  findContentDuplicates,
  findDuplicates,
  matchBestPattern,
} from '@/lib/auditer/patterns'
import { downloadAuditReport, type ResultadoArquivo } from '@/lib/auditer/report'
import { useSpellChecker } from '@/lib/auditer/useSpellChecker'
import Dropzone from '@/pages/configuracao/nomenclatura/Dropzone'
import type { Bancada } from '@/pages/configuracao/nomenclatura/estado'
import LinhaResultado, {
  type Duplicidade,
} from '@/pages/configuracao/nomenclatura/ResultadoArquivo'

const ehExcel = (nome: string) => /\.(xlsx|xlsm|xls)$/i.test(nome)

type Filtro = 'todos' | 'problema' | 'nome' | 'dup' | 'orto' | 'limpo'

let sequencia = 0

function Kpi({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: 'ok' | 'ruim' | 'alerta' }) {
  return (
    <div className="card aud-kpi">
      <div className="aud-kpi-rot">{rotulo}</div>
      <div className={`aud-kpi-num${valor > 0 && tom ? ` ${tom}` : ''}`}>{valor}</div>
    </div>
  )
}

export default function AbaAuditoriaArquivos({ bancada }: { bancada: Bancada }) {
  const { L } = useI18n()
  const { padroes, aceitas, aceitarPalavra } = bancada
  const { status: statusCorretor, error: erroCorretor, check, retry, langs } = useSpellChecker()
  const [resultados, setResultados] = useState<ResultadoArquivo[]>([])
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const temIngles = langs.includes('en')

  // Aceitar uma palavra faz duas coisas: guarda para os próximos arquivos E
  // some AGORA com as ocorrências já na tela — senão o clique parece não fazer
  // nada e obriga a reenviar o arquivo.
  const aceitarELimpar = useCallback(
    (palavra: string) => {
      aceitarPalavra(palavra)
      const chave = palavra.toLowerCase()
      setResultados((anteriores) =>
        anteriores.map((r) =>
          r.spelling?.length
            ? { ...r, spelling: r.spelling.filter((o) => o.word.toLowerCase() !== chave) }
            : r,
        ),
      )
    },
    [aceitarPalavra],
  )

  const auditar = useCallback(
    async (entrada: ResultadoArquivo) => {
      const name = padroes.length ? matchBestPattern(entrada.file.name, padroes) : null
      // Higiene independe de padrão: vale mesmo sem padrão cadastrado e mesmo
      // quando o nome casa (espaço duplo passa pela caminhada sem reprovar).
      const hygiene = checkFilenameHygiene(entrada.file.name)

      // Lê o conteúdo uma vez: serve ao hash e, se for Excel, ao SheetJS.
      let hash: string | null = null
      let buffer: ArrayBuffer | null = null
      try {
        buffer = await entrada.file.arrayBuffer()
        hash = await sha256(buffer)
      } catch {
        // Arquivo ilegível: segue sem hash, a detecção por conteúdo só o ignora.
      }

      let spelling: ResultadoArquivo['spelling'] = null
      let spellError: string | null = null
      if (ehExcel(entrada.file.name)) {
        try {
          const { entries } = await extractTexts(buffer ?? entrada.file)
          spelling = await check(entries, { ignoreWords: aceitas })
        } catch (err) {
          spellError = err instanceof Error ? err.message : String(err)
        }
      } else {
        spellError = 'not-excel'
      }

      setResultados((anteriores) =>
        anteriores.map((r) =>
          r.id === entrada.id ? { ...r, status: 'done', name, hygiene, hash, spelling, spellError } : r,
        ),
      )
    },
    [check, padroes, aceitas],
  )

  const receber = useCallback(
    (arquivos: File[]) => {
      const entradas: ResultadoArquivo[] = arquivos.map((file) => ({
        id: ++sequencia,
        file,
        status: 'pending',
      }))
      setResultados((anteriores) => [...entradas, ...anteriores])
      // Sequencial de propósito: o worker é um só, disparar tudo de uma vez
      // apenas encheria a fila dele sem acelerar nada.
      entradas.reduce((fila, entrada) => fila.then(() => auditar(entrada)), Promise.resolve())
    },
    [auditar],
  )

  // Duplicidade é cruzada entre TODOS os arquivos da sessão, não por arquivo.
  const porNome = useMemo(() => {
    const grupos = findDuplicates(resultados.map((r) => r.file.name))
    const mapa = new Map<string, { type: 'exact' | 'documento'; others: string[] }>()
    for (const g of grupos) {
      for (const f of g.files) {
        mapa.set(f.toLowerCase(), { type: g.type, others: g.files.filter((x) => x !== f) })
      }
    }
    return mapa
  }, [resultados])

  const porConteudo = useMemo(() => {
    const grupos = findContentDuplicates(
      resultados.map((r) => ({ name: r.file.name, hash: r.hash })),
    )
    const porHash = new Map(grupos.map((g) => [g.hash, g.files]))
    const mapa = new Map<number, { others: string[] }>()
    for (const r of resultados) {
      if (!r.hash) continue
      const nomes = porHash.get(r.hash)
      if (!nomes) continue
      const outros = [...new Set(nomes.filter((n) => n !== r.file.name))]
      // Só interessa quando há ao menos um NOME diferente — é a cópia
      // renomeada. Nomes iguais já são duplicidade de nome.
      if (outros.length) mapa.set(r.id, { others: outros })
    }
    return mapa
  }, [resultados])

  const duplicidadeDe = useCallback(
    (r: ResultadoArquivo): Duplicidade | null => {
      const nome = porNome.get(r.file.name.toLowerCase()) ?? null
      const conteudo = porConteudo.get(r.id) ?? null
      return nome || conteudo ? { name: nome, content: conteudo } : null
    },
    [porNome, porConteudo],
  )

  const ehDuplicado = useCallback(
    (r: ResultadoArquivo) => porNome.has(r.file.name.toLowerCase()) || porConteudo.has(r.id),
    [porNome, porConteudo],
  )

  const numeros = useMemo(() => {
    const prontos = resultados.filter((r) => r.status === 'done')
    const limpo = (r: ResultadoArquivo) =>
      r.name?.ok !== false &&
      (r.hygiene?.length ?? 0) === 0 &&
      (r.spelling?.length ?? 0) === 0 &&
      !ehDuplicado(r)
    return {
      total: resultados.length,
      naFila: resultados.filter((r) => r.status !== 'done').length,
      nome: prontos.filter((r) => r.name?.ok === false).length,
      higiene: prontos.filter((r) => (r.hygiene?.length ?? 0) > 0).length,
      ortografia: prontos.reduce((soma, r) => soma + (r.spelling?.length ?? 0), 0),
      duplicados: prontos.filter(ehDuplicado).length,
      limpos: prontos.filter(limpo).length,
      comProblema: prontos.filter((r) => !limpo(r)).length,
    }
  }, [resultados, ehDuplicado])

  const passaNoFiltro = useCallback(
    (r: ResultadoArquivo) => {
      if (filtro === 'todos') return true
      // Pendentes só aparecem em "Todos": ainda não foram classificados.
      if (r.status !== 'done') return false
      const nomeRuim = r.name?.ok === false || (r.hygiene?.length ?? 0) > 0
      const ortoRuim = (r.spelling?.length ?? 0) > 0
      const dup = ehDuplicado(r)
      switch (filtro) {
        case 'problema':
          return nomeRuim || ortoRuim || dup
        case 'nome':
          return nomeRuim
        case 'dup':
          return dup
        case 'orto':
          return ortoRuim
        case 'limpo':
          return !nomeRuim && !ortoRuim && !dup
        default:
          return true
      }
    },
    [filtro, ehDuplicado],
  )

  const visiveis = useMemo(() => resultados.filter(passaNoFiltro), [resultados, passaNoFiltro])
  const temProblema =
    numeros.nome > 0 || numeros.higiene > 0 || numeros.ortografia > 0 || numeros.duplicados > 0

  const chips: Array<[Filtro, string, number]> = [
    ['todos', L('Todos', 'All'), numeros.total],
    ['problema', L('Com problema', 'With issues'), numeros.comProblema],
    ['nome', L('Nome', 'Name'), numeros.nome + numeros.higiene],
    ['dup', L('Duplicados', 'Duplicates'), numeros.duplicados],
    ['orto', L('Ortografia', 'Spelling'), numeros.ortografia],
    ['limpo', L('Sem problema', 'Clean'), numeros.limpos],
  ]

  return (
    <>
      {statusCorretor === 'loading' && (
        <p className="hint" style={{ marginTop: 0 }}>
          {L(
            'Carregando os dicionários (pt-BR + inglês). Você já pode soltar os arquivos — eles entram na fila.',
            'Loading the dictionaries (pt-BR + English). You can already drop the files — they queue up.',
          )}
        </p>
      )}

      {statusCorretor === 'ready' && (
        <p className="hint" style={{ marginTop: 0 }}>
          {temIngles
            ? L(
                'Corretor pronto — a ortografia é auditada em português e inglês; termo técnico em inglês não conta como erro.',
                'Spell checker ready — spelling is audited in Portuguese and English; English technical terms do not count as errors.',
              )
            : L(
                'Corretor em só português — o dicionário de inglês não carregou. Termos técnicos em inglês podem aparecer como erro.',
                'Spell checker in Portuguese only — the English dictionary did not load. English technical terms may show up as errors.',
              )}
        </p>
      )}

      {statusCorretor === 'error' && (
        <div className="erro">
          <b>{L('O corretor ortográfico não carregou.', 'The spell checker did not load.')}</b>{' '}
          {erroCorretor?.kind === 'dictionary'
            ? L(
                'Os dicionários não foram encontrados. Rode `npm install` (ou `node scripts/copy-dict.mjs`) para gerar public/dictionaries e recarregue.',
                'The dictionaries were not found. Run `npm install` (or `node scripts/copy-dict.mjs`) to generate public/dictionaries and reload.',
              )
            : L(
                'A auditoria de nome e de duplicidade continua funcionando normalmente.',
                'Name and duplicate auditing keeps working normally.',
              )}
          <div className="code" style={{ fontSize: 11, marginTop: 6 }}>
            {erroCorretor?.message}
            {erroCorretor?.detail}
          </div>
          <div className="eact" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={retry}>
              {L('Tentar novamente', 'Try again')}
            </button>
          </div>
        </div>
      )}

      {padroes.length === 0 && (
        <p className="hint" style={{ marginTop: 0 }}>
          {L(
            'Nenhum padrão avançado cadastrado — o nome dos arquivos não será conferido contra padrão (a higiene e a duplicidade continuam valendo). Cadastre na aba "Padrões avançados".',
            'No advanced pattern registered — file names will not be checked against a pattern (hygiene and duplicates still apply). Register one in the "Advanced patterns" tab.',
          )}
        </p>
      )}

      <Dropzone onArquivos={receber} />

      {resultados.length > 0 && (
        <>
          {numeros.naFila > 0 && (
            <p className="hint">
              {L('Auditando…', 'Auditing…')}{' '}
              <b>
                {numeros.total - numeros.naFila} {L('de', 'of')} {numeros.total}
              </b>{' '}
              {L('concluídos', 'done')}
            </p>
          )}

          <div className="aud-kpis">
            <Kpi rotulo={L('Arquivos', 'Files')} valor={numeros.total} />
            <Kpi rotulo={L('Sem problema', 'Clean')} valor={numeros.limpos} tom="ok" />
            <Kpi rotulo={L('Nome fora do padrão', 'Name off-pattern')} valor={numeros.nome} tom="ruim" />
            <Kpi rotulo={L('Higiene de nome', 'Name hygiene')} valor={numeros.higiene} tom="ruim" />
            <Kpi rotulo={L('Duplicados', 'Duplicates')} valor={numeros.duplicados} tom="ruim" />
            <Kpi rotulo={L('Erros de ortografia', 'Spelling errors')} valor={numeros.ortografia} tom="alerta" />
          </div>

          <div className="acoes">
            <button
              className="btn"
              onClick={() => downloadAuditReport(resultados)}
              disabled={!temProblema}
            >
              {L('Baixar auditoria (.xlsx)', 'Download audit (.xlsx)')}
            </button>
            <button className="btn" onClick={() => setResultados([])}>
              {L('Limpar lista', 'Clear list')}
            </button>
          </div>

          <div className="filters">
            {chips.map(([chave, rotulo, contagem]) => (
              <button
                key={chave}
                className={`chip${filtro === chave ? ' on' : ''}`}
                onClick={() => setFiltro(chave)}
              >
                {rotulo} {contagem}
              </button>
            ))}
          </div>

          {visiveis.length === 0 ? (
            <div className="card">
              <div className="empty">{L('Nenhum arquivo neste filtro.', 'No file in this filter.')}</div>
            </div>
          ) : (
            visiveis.map((r) => (
              <LinhaResultado
                key={r.id}
                resultado={r}
                duplicidade={duplicidadeDe(r)}
                onAceitarPalavra={aceitarELimpar}
                onRemover={(id) => setResultados((anteriores) => anteriores.filter((x) => x.id !== id))}
              />
            ))
          )}
        </>
      )}

      {resultados.length === 0 && (
        <div className="card">
          <div className="empty">
            <b>{L('Nenhum arquivo auditado ainda', 'No file audited yet')}</b>
            {L(
              'Solte os arquivos acima — pode ser a pasta inteira do ACC. Tudo roda no seu navegador; nada é enviado para o servidor.',
              'Drop the files above — it can be the whole ACC folder. Everything runs in your browser; nothing is sent to the server.',
            )}
          </div>
        </div>
      )}
    </>
  )
}
