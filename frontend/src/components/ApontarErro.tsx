/** "Apontar erro" — a ferramenta de bug DA TOPBAR: pílula própria e painel.
 *
 *  Saiu do menu da conta em 31/07/2026, a pedido, e a mudança não é só de
 *  lugar. Dentro do menu, relatar um problema custava dois cliques e um deles
 *  era em "minha conta" — o lugar de quem vai trocar de senha, não de quem
 *  acabou de esbarrar num defeito. Na barra é UM clique, e o ícone de inseto
 *  se reconhece sem ler.
 *
 *  Não confundir com `Apontamentos`, que é do MODELO auditado e vira issue no
 *  ACC. Este é da PLATAFORMA e vira trabalho de quem a mantém — daí o rótulo
 *  "Apontar erro" e não "novo apontamento".
 *
 *  ESCREVER É DE QUALQUER PESSOA AUTENTICADA, e isso é decisão de projeto:
 *  quem não consegue usar uma tela é justamente quem precisa avisar, e exigir
 *  permissão para reportar filtraria fora o relato de quem mais depende dele.
 *  Quem LÊ é só quem administra — o print mostra dado de projeto.
 *
 *  O CAMINHO VAI JUNTO, sem ninguém digitar. "Não funciona" sem a tela é um
 *  chamado que começa com uma pergunta; a URL responde metade dela de graça.
 */
import { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

export default function ApontarErro() {
  const { L } = useI18n()
  const [aberto, setAberto] = useState(false)
  const rotulo = L('Apontar erro', 'Report a problem')

  return (
    <div className="erroact">
      <button
        type="button"
        className={`pillact${aberto ? ' on' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={rotulo}
        aria-label={rotulo}
        aria-expanded={aberto}
      >
        <span className="rot">{rotulo}</span>
        <span className="ico">
          {/* Inseto: é o desenho que a indústria inteira usa para "defeito", e
              o único da barra que não precisa do rótulo para ser entendido. */}
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1" />
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM12 20v-9" />
            <path d="M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4" />
            <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
          </svg>
        </span>
      </button>

      {/* SEM fechar por clique fora e SEM Esc, ao contrário do sino e do menu
          da conta: aqui há texto digitado, e os dois gestos que fecham aqueles
          painéis por engano custariam o relato inteiro. Fecha-se pela pílula,
          pelo Cancelar ou enviando. */}
      {aberto && <Painel onFechar={() => setAberto(false)} />}
    </div>
  )
}

function Painel({ onFechar }: { onFechar: () => void }) {
  const { L } = useI18n()
  const { pathname, search } = useLocation()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [print, setPrint] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const campoArquivo = useRef<HTMLInputElement>(null)

  async function enviar() {
    if (!titulo.trim()) {
      setErro(L('Diga em uma linha o que aconteceu.', 'Say in one line what happened.'))
      return
    }
    setErro(null)
    setEnviando(true)
    try {
      const reporte = await api.reportes.criar({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        caminho: `${pathname}${search}`,
      })

      // O print é opcional e vai numa segunda chamada — exigir multipart em
      // todo reporte obrigaria quem só quer escrever duas linhas a montar um
      // FormData. Se ELE falhar, o reporte já existe: dizer isso é melhor do
      // que sugerir que nada foi enviado.
      if (print) {
        try {
          await api.reportes.enviarPrint(reporte.id, print)
        } catch (e) {
          const detalhe = e instanceof ApiError ? e.message : String(e)
          setErro(
            L(
              `O relato foi enviado, mas o print não: ${detalhe}`,
              `The report was sent, but the screenshot was not: ${detalhe}`,
            ),
          )
          setEnviando(false)
          return
        }
      }

      setEnviado(true)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="side-painel erro-painel">
        <div className="sinocab">
          <b>{L('Obrigado', 'Thank you')}</b>
        </div>
        <div style={{ padding: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {L(
              'O relato chegou a quem administra a plataforma, junto com a tela em que você estava. Você não recebe resposta automática — se for preciso, alguém procura você.',
              'Your report reached whoever administers the platform, along with the screen you were on. There is no automatic reply — if needed, someone will reach out.',
            )}
          </p>
          <button className="btn block" onClick={onFechar}>
            {L('Fechar', 'Close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="side-painel erro-painel">
      <div className="sinocab">
        <b>{L('Apontar erro', 'Report a problem')}</b>
      </div>

      <div style={{ padding: 14 }}>
        <p className="hint" style={{ marginTop: 0 }}>
          {L(
            'Algo não funcionou como deveria? Conte aqui. A tela em que você está vai junto — não precisa descrevê-la.',
            'Something did not work as expected? Tell us here. The screen you are on goes along — no need to describe it.',
          )}
        </p>

        <Erro mensagem={erro} />

        <input
          className="f"
          style={{ marginBottom: 8 }}
          autoFocus
          placeholder={L('O que aconteceu, em uma linha', 'What happened, in one line')}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
        />
        <textarea
          className="f"
          rows={4}
          style={{ marginBottom: 10 }}
          placeholder={L(
            'O que você tentou fazer, e o que apareceu no lugar.',
            'What you were trying to do, and what showed up instead.',
          )}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />

        <input
          ref={campoArquivo}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => setPrint(e.target.files?.[0] ?? null)}
        />
        <div className="erro-print">
          <button className="btn sm" onClick={() => campoArquivo.current?.click()}>
            {print ? L('trocar print', 'replace screenshot') : L('Anexar print', 'Attach screenshot')}
          </button>
          {print && <span className="mmeta">{print.name}</span>}
        </div>

        <div className="eact" style={{ marginTop: 12 }}>
          <button className="btn pri" onClick={enviar} disabled={enviando}>
            {enviando ? L('Enviando…', 'Sending…') : L('Enviar', 'Send')}
          </button>
          <button className="btn" onClick={onFechar} disabled={enviando}>
            {L('Cancelar', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
