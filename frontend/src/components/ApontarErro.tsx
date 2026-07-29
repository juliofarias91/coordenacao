/** "Apontar erro" — o painel que qualquer pessoa abre pelo menu da conta.
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

export default function ApontarErro({ onFechar }: { onFechar: () => void }) {
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
