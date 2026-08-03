/** A IMAGEM DE UMA LINHA DA PLANILHA — colar com Ctrl+V ou anexar arquivo.
 *
 *  A coluna IMAGE da planilha de origem é onde a coordenação prova o que
 *  escreveu no comentário: um recorte da tela do Revit, quase sempre. E recorte
 *  de tela nasce na ÁREA DE TRANSFERÊNCIA — quem acabou de apertar Print Screen
 *  não tem arquivo nenhum para escolher num seletor. Era isso que faltava: só
 *  havia o seletor de arquivo, e usá-lo exigia salvar a imagem em algum lugar
 *  antes, dar um nome a ela e depois ir buscá-la.
 *
 *  POR QUE GAVETA E NÃO UM MODAL CENTRADO. O sistema visual tem três famílias de
 *  superfície — tela de trabalho, card e gaveta — e a regra da gaveta é
 *  exatamente esta: formulário pontual disparado de uma tela de trabalho. Um
 *  modal centrado seria uma quarta família, com as próprias regras de tamanho,
 *  foco e fechamento, para fazer o que esta já faz. De quebra a gaveta não tapa
 *  a planilha: a linha de onde se veio continua visível à esquerda, e é ela que
 *  diz a que item a imagem pertence.
 *
 *  ELA FECHA POR Esc E POR CLIQUE FORA — ao contrário do `ApontarErro`, e a
 *  diferença é o que se perde: lá há um relato digitado, aqui o que existe é uma
 *  imagem que continua na área de transferência e se cola de novo em dois
 *  segundos.
 *
 *  O ENVIO É IMEDIATO, sem botão "confirmar". Colar já é o ato de anexar — pedir
 *  uma confirmação depois dele acrescenta um passo que não corresponde a decisão
 *  nenhuma. A prévia existe para o caso oposto: colar a imagem errada, ver e
 *  remover.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import Gaveta from '@/components/Gaveta'
import { Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import type { Evidencia } from '@/lib/types'

/** O que o backend aceita (`EVIDENCIA_EXTENSOES`, em `api/v1/auditorias.py`).
 *  Repetido aqui para o seletor de arquivo já filtrar — a validação de verdade
 *  continua no servidor, que é quem grava. */
const ACEITOS = 'image/png,image/jpeg,image/webp,application/pdf'

/** A extensão que o nome do arquivo colado recebe.
 *
 *  O `Clipboard` entrega um `File` chamado "image.png" no Chrome e um sem nome
 *  em outros navegadores — e o servidor decide o formato pela EXTENSÃO do nome,
 *  não pelo `content-type`. Sem batizar o arquivo aqui, colar no navegador
 *  errado responde "formato não aceito" para uma imagem perfeitamente válida. */
function batizar(arquivo: File): File {
  if (/\.(png|jpe?g|webp|pdf)$/i.test(arquivo.name)) return arquivo
  const ext = arquivo.type === 'image/jpeg' ? 'jpg' : arquivo.type === 'image/webp' ? 'webp' : 'png'
  return new File([arquivo], `colado.${ext}`, { type: arquivo.type || 'image/png' })
}

export default function ImagemDaLinha({
  aberta,
  titulo,
  evidencias,
  travada,
  ocupado,
  erro,
  onFechar,
  onEnviar,
  onAbrir,
  onRemover,
}: {
  aberta: boolean
  /** O item da linha — é o que diz a que pergunta esta imagem responde. */
  titulo: string
  evidencias: Evidencia[]
  travada: boolean
  ocupado: boolean
  /** O erro da página. Ele entra AQUI DENTRO porque a gaveta cobre a tela: um
   *  "formato não aceito" desenhado atrás dela é um envio que falhou em
   *  silêncio. */
  erro: string | null
  onFechar: () => void
  onEnviar: (arquivo: File) => void
  onAbrir: (evidenciaId: string) => void
  onRemover: (evidenciaId: string) => void
}) {
  const { L } = useI18n()
  const [previa, setPrevia] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  const receber = useCallback(
    (f: File | null | undefined) => {
      if (!f) return
      if (travada) return
      setAviso(null)
      const pronto = batizar(f)
      // A prévia é local e imediata: subir para o S3 e voltar com a URL assinada
      // leva segundos, e a pessoa precisa ver AGORA que colou o que queria.
      setPrevia((atual) => {
        if (atual) URL.revokeObjectURL(atual)
        return pronto.type.startsWith('image/') ? URL.createObjectURL(pronto) : null
      })
      onEnviar(pronto)
    },
    [travada, onEnviar],
  )

  // O Ctrl+V é ouvido NO DOCUMENTO, não numa caixa com foco. Quem acabou de
  // colar não clicou em lugar nenhum — abriu o painel e apertou as duas teclas.
  // Exigir que ele primeiro desse foco a uma área tornaria o gesto duas ações.
  useEffect(() => {
    if (!aberta || travada) return
    const aoColar = (e: ClipboardEvent) => {
      const itens = e.clipboardData?.items
      if (!itens) return
      for (const item of itens) {
        if (item.kind === 'file') {
          const f = item.getAsFile()
          if (f) {
            e.preventDefault()
            receber(f)
            return
          }
        }
      }
      // Colou algo que não é arquivo (texto, quase sempre). Dizer isso evita o
      // "apertei Ctrl+V e não aconteceu nada".
      setAviso(
        L(
          'O que está na área de transferência não é uma imagem.',
          'What is on the clipboard is not an image.',
        ),
      )
    }
    document.addEventListener('paste', aoColar)
    return () => document.removeEventListener('paste', aoColar)
  }, [aberta, travada, receber, L])

  // A prévia some ao fechar: reabrir noutra linha mostrando a imagem da linha
  // anterior faria pensar que aquela linha já tem anexo.
  useEffect(() => {
    if (aberta) return
    setPrevia((atual) => {
      if (atual) URL.revokeObjectURL(atual)
      return null
    })
    setAviso(null)
  }, [aberta])

  return (
    <Gaveta
      aberta={aberta}
      titulo={L('Imagem da linha', 'Row image')}
      sub={titulo}
      onFechar={onFechar}
    >
      <Erro mensagem={aviso ?? erro} />

      {!travada && (
        <div className="colar" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            receber(e.dataTransfer.files?.[0])
          }}
        >
          <b>{L('Cole aqui com Ctrl+V', 'Paste here with Ctrl+V')}</b>
          <span className="hint">
            {L(
              'O recorte de tela vai direto — não precisa salvar o arquivo antes. Também dá para arrastar um arquivo para cá.',
              'A screenshot goes straight in — no need to save it first. You can also drag a file here.',
            )}
          </span>
          <button
            type="button"
            className="btn"
            disabled={ocupado}
            onClick={() => arquivo.current?.click()}
          >
            {L('Anexar arquivo…', 'Attach file…')}
          </button>
          <input
            ref={arquivo}
            type="file"
            accept={ACEITOS}
            hidden
            onChange={(e) => {
              receber(e.target.files?.[0])
              // Zera o input: sem isto, reenviar o MESMO arquivo depois de um
              // erro não dispara `change` e nada acontece.
              e.target.value = ''
            }}
          />
        </div>
      )}

      {previa && (
        <div className="colar-previa">
          <img src={previa} alt={L('Imagem colada', 'Pasted image')} />
          <span className="hint">
            {ocupado ? L('Enviando…', 'Uploading…') : L('Enviada.', 'Uploaded.')}
          </span>
        </div>
      )}

      <div className="colar-lista">
        {evidencias.length === 0 && (
          <span className="hint">{L('Nenhuma imagem ainda.', 'No image yet.')}</span>
        )}
        {evidencias.map((ev) => (
          <div key={ev.id} className="colar-item">
            <button type="button" className="colar-nome" onClick={() => onAbrir(ev.id)}>
              {ev.legenda || ev.arquivo_url.split('/').pop()}
            </button>
            {!travada && (
              <button
                type="button"
                className="btn sm perigo"
                disabled={ocupado}
                onClick={() => onRemover(ev.id)}
              >
                {L('Remover', 'Remove')}
              </button>
            )}
          </div>
        ))}
      </div>
    </Gaveta>
  )
}
