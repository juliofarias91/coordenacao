/** Ficha cadastral do projeto — quem é a obra, não como ela é auditada.
 *
 *  ELA É A CASA DOS DADOS DO PROJETO, e a única: a aba `Configuração › Projeto`
 *  deixou de existir em 30/07/2026 porque as duas editavam exatamente os mesmos
 *  cinco campos, e duas telas para o mesmo dado divergem na primeira mudança.
 *
 *  DESDE 07/08/2026 ELA É A PRIMEIRA ABA DA CONFIGURAÇÃO, a pedido — não mais um
 *  item da barra do projeto. A tela é a mesma; o que mudou é a vizinhança, e ela
 *  faz sentido: ficha, PEB, mandate, áreas, projetistas, nomenclatura e
 *  disciplinas são o que se preenche UMA VEZ, em sequência, quando o projeto
 *  nasce. A barra do projeto ficou com o que se usa todo dia.
 *
 *  MODELO: a `FichaSection` do VDCity. O que veio de lá é a ESTRUTURA — nome
 *  editável no cabeçalho com a situação à direita, duas colunas rotuladas, campos
 *  que só se distinguem de texto quando se pode editá-los, e o excluir isolado no
 *  rodapé. O que não veio:
 *
 *  - **A imagem de capa.** Exigiria upload para o S3 e uma coluna a mais para
 *    servir de enfeite numa plataforma que audita modelo, não vende imóvel.
 *  - **O mapa embutido.** O iframe do Google entrega o endereço da obra do
 *    cliente ao Google em toda visita, e esta plataforma tem política de
 *    privacidade que teria de declarar isso.
 *  - **Os sete campos de endereço** (CEP, logradouro, número…). Lá eles
 *    alimentam busca por CEP e o mapa; aqui seriam seis colunas concatenadas só
 *    para exibir.
 *
 *  SALVA NO BLUR, campo por campo — o mesmo comportamento das planilhas de
 *  auditoria (`components/planilha.tsx`). Não há botão "salvar" nem rascunho:
 *  numa ficha que se preenche aos poucos, o botão é a chance de fechar a aba com
 *  a alteração perdida.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Erro } from '@/components/ui'
import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Cliente, Projeto } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

const STATUS: Array<[string, string, string]> = [
  ['config', 'Em configuração', 'Setting up'],
  ['ativo', 'Ativo', 'Active'],
  ['piloto', 'Piloto', 'Pilot'],
  ['encerrado', 'Encerrado', 'Closed'],
]

/** Os campos que a ficha grava. `codigo` fica de fora: ele é o primeiro
 *  segmento da nomenclatura de todo arquivo do projeto, e mudá-lo invalidaria
 *  o nome de tudo que já foi entregue. */
type Campos = Pick<
  Projeto,
  | 'nome'
  | 'cliente_id'
  | 'coordenacao'
  | 'bep_ref'
  | 'status'
  | 'descricao'
  | 'endereco'
  | 'data_inicio'
  | 'data_prevista'
  | 'data_conclusao'
>

const VAZIO: Campos = {
  nome: '',
  cliente_id: null,
  coordenacao: null,
  bep_ref: null,
  status: 'config',
  descricao: null,
  endereco: null,
  data_inicio: null,
  data_prevista: null,
  data_conclusao: null,
}

function doProjeto(p: Projeto): Campos {
  return {
    nome: p.nome,
    cliente_id: p.cliente_id,
    coordenacao: p.coordenacao,
    bep_ref: p.bep_ref,
    status: p.status,
    descricao: p.descricao,
    endereco: p.endereco,
    data_inicio: p.data_inicio,
    data_prevista: p.data_prevista,
    data_conclusao: p.data_conclusao,
  }
}

export default function Ficha() {
  const { projeto, recarregar } = useProjeto()
  const { L } = useI18n()
  const { pode } = useAuth()
  const navegar = useNavigate()

  const [form, setForm] = useState<Campos>(VAZIO)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const editavel = pode('admin_cadastro')

  useEffect(() => {
    api.clientes
      .listar()
      .then((r) => setClientes(r.itens))
      .catch(() => setClientes([]))
  }, [])

  useEffect(() => {
    if (projeto) setForm(doProjeto(projeto))
  }, [projeto])

  /** Grava UM campo. Chamado no blur do input e no change do select — num
   *  `<select>` não há rascunho: a escolha já é a decisão.
   *
   *  COMPARA O VALOR QUE CHEGA, não o do `form`. É a diferença entre funcionar
   *  e não funcionar no `<select>`: lá o `setForm` e o `gravar` saem no mesmo
   *  manipulador, e o `form` que este closure enxerga ainda é o ANTERIOR ao
   *  `setForm` — igual ao do servidor. A guarda de "nada mudou" então
   *  disparava sempre, e trocar a situação ou o cliente não salvava nada.
   */
  const gravar = useCallback(
    async (mudanca: Partial<Campos>) => {
      if (!projeto || !editavel) return
      // Nada mudou de fato: não gasta uma requisição por passar o cursor.
      const chave = Object.keys(mudanca)[0] as keyof Campos
      if (mudanca[chave] === doProjeto(projeto)[chave]) return

      setErro(null)
      setSalvando(true)
      try {
        await api.projetos.atualizar(projeto.id, mudanca)
        await recarregar()
        setSalvo(true)
        setTimeout(() => setSalvo(false), 1800)
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : String(e))
        // Devolve o valor do servidor: deixar na tela um texto que não foi
        // gravado é pior do que perdê-lo, porque parece salvo.
        setForm(doProjeto(projeto))
      } finally {
        setSalvando(false)
      }
    },
    // Sem `form`: depois da correção acima ele não é mais lido aqui, e tirá-lo
    // deixa o `gravar` estável entre renderizações — um `useCallback` que muda
    // a cada tecla não guarda nada.
    [projeto, editavel, recarregar],
  )

  async function remover() {
    if (!projeto) return
    setErro(null)
    try {
      await api.projetos.remover(projeto.id)
      // Sai do projeto: a tela em que se está deixou de existir.
      navegar('/')
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      setConfirmando(false)
    }
  }

  if (!projeto) return null

  /** Um campo de texto. `defaultValue` não — o valor é controlado para o
   *  recarregar do servidor poder corrigi-lo depois de um erro. */
  const texto = (chave: keyof Campos, tipo: 'text' | 'date' = 'text') => (
    <input
      className="f"
      type={tipo}
      value={(form[chave] as string | null) ?? ''}
      readOnly={!editavel}
      onChange={(e) => setForm({ ...form, [chave]: e.target.value || null })}
      onBlur={() => gravar({ [chave]: form[chave] } as Partial<Campos>)}
    />
  )

  const rotulo = (pt: string, en: string) => <span className="fl">{L(pt, en)}</span>

  return (
    <>
      <Erro mensagem={erro} />

      <div className="fichacab">
        <div className="fichacod">{projeto.codigo}</div>
        <input
          className="fichanome"
          value={form.nome}
          readOnly={!editavel}
          placeholder={L('Nome da obra', 'Project name')}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          onBlur={() => gravar({ nome: form.nome })}
        />
        <div className="fichaestado">
          {salvando && <span className="mmeta">{L('salvando…', 'saving…')}</span>}
          {salvo && !salvando && <span className="pill ok">{L('salvo', 'saved')}</span>}
          <select
            className="f"
            style={{ width: 'auto' }}
            value={form.status}
            disabled={!editavel}
            onChange={(e) => {
              setForm({ ...form, status: e.target.value })
              gravar({ status: e.target.value })
            }}
          >
            {STATUS.map(([v, pt, en]) => (
              <option key={v} value={v}>
                {L(pt, en)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ficha">
        {/* ------------------------------------------- informações gerais */}
        <section className="fichacol">
          <h3>{L('Informações gerais', 'General information')}</h3>

          <div className="fichacampo largo">
            {rotulo('Descrição', 'Description')}
            <textarea
              className="f"
              rows={4}
              value={form.descricao ?? ''}
              readOnly={!editavel}
              placeholder={L('O que é esta obra', 'What this project is')}
              onChange={(e) => setForm({ ...form, descricao: e.target.value || null })}
              onBlur={() => gravar({ descricao: form.descricao })}
            />
          </div>

          <div className="fichagrade">
            <div className="fichacampo">
              {rotulo('Cliente', 'Client')}
              <select
                className="f"
                value={form.cliente_id ?? ''}
                disabled={!editavel}
                onChange={(e) => {
                  const cliente_id = e.target.value || null
                  setForm({ ...form, cliente_id })
                  gravar({ cliente_id })
                }}
              >
                <option value="">{L('— sem cliente —', '— no client —')}</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="fichacampo">
              {rotulo('Coordenação', 'Coordination')}
              {texto('coordenacao')}
            </div>
            <div className="fichacampo largo">
              {rotulo('PEB de referência', 'Reference BEP')}
              {texto('bep_ref')}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ prazo e local */}
        <section className="fichacol">
          <h3>{L('Prazo e localização', 'Schedule and location')}</h3>

          <div className="fichagrade">
            <div className="fichacampo">
              {rotulo('Início', 'Start')}
              {texto('data_inicio', 'date')}
            </div>
            <div className="fichacampo">
              {rotulo('Previsão', 'Planned')}
              {texto('data_prevista', 'date')}
            </div>
            <div className="fichacampo">
              {rotulo('Conclusão', 'Completed')}
              {texto('data_conclusao', 'date')}
            </div>
            <div className="fichacampo largo">
              {rotulo('Endereço', 'Address')}
              {texto('endereco')}
            </div>
          </div>

          {/* As duas datas do fim são separadas, e a diferença entre elas é a
              única coisa que a ficha CALCULA — porque é a pergunta que se faz
              olhando um cronograma. */}
          <Atraso prevista={form.data_prevista} conclusao={form.data_conclusao} />

          <p className="hint">
            {L(
              'O código do projeto é imutável: ele é o primeiro segmento da nomenclatura de todos os arquivos entregues.',
              'The project code is immutable: it is the first segment of every delivered file name.',
            )}
          </p>
        </section>
      </div>

      {/* ------------------------------------------------------- remover */}
      {editavel && (
        <div className="fichaperigo">
          {!confirmando ? (
            <button className="btn danger" onClick={() => setConfirmando(true)}>
              {L('Remover projeto', 'Remove project')}
            </button>
          ) : (
            <div className="fichaconfirma">
              <p>
                {L(
                  'Remover manda o projeto para a Lixeira, com disciplinas, modelos e auditorias. Ele some das listas e volta de lá com um clique.',
                  'Removing sends the project to the Trash, with its disciplines, models and audits. It disappears from the lists and comes back with one click.',
                )}
              </p>
              <div className="eact">
                <button className="btn" onClick={() => setConfirmando(false)}>
                  {L('Cancelar', 'Cancel')}
                </button>
                <button className="btn danger" onClick={remover}>
                  {L('Confirmar remoção', 'Confirm removal')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** O atraso entre a previsão e a conclusão.
 *
 *  Só aparece quando há as duas datas: com uma só, qualquer número seria
 *  inventado. Verde não — entregar no prazo é o esperado, e o sistema visual
 *  reserva cor para o que se varre a tela procurando. */
function Atraso({ prevista, conclusao }: { prevista: string | null; conclusao: string | null }) {
  const { L } = useI18n()
  if (!prevista || !conclusao) return null

  const dias = Math.round(
    (new Date(conclusao).getTime() - new Date(prevista).getTime()) / 86_400_000,
  )
  if (dias <= 0) {
    return (
      <p className="hint">
        {L('Concluída dentro da previsão.', 'Completed within the planned date.')}
      </p>
    )
  }
  return (
    <p className="hint">
      <span className="pill alerta">
        {dias} {L(dias === 1 ? 'dia de atraso' : 'dias de atraso', dias === 1 ? 'day late' : 'days late')}
      </span>
    </p>
  )
}
