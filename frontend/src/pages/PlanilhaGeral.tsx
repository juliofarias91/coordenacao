/** A planilha da auditoria geral — a aba BASE GERAL, dentro do sistema.
 *
 *  É a tela que o pedido descreve: "toda vez que gerarmos um modelo ele deve ter
 *  um campo de auditoria pra ele pra imputarmos os dados". Uma linha por item,
 *  as colunas da planilha, e se digita nela.
 *
 *  AS COLUNAS SÃO AS DO ARQUIVO, e a correspondência é literal:
 *
 *    INFORMATION      → o nome do critério (com a instrução de como conferir)
 *    VERIFICATION     → o status: aprovado / reprovado / N/A / pendente
 *    COMENTARY        → `comentario`, o diagnóstico
 *    DIRECTION        → `direcao`, a orientação ao fornecedor (migration 0008)
 *    IMAGE            → as evidências
 *    ITEMS ANALYZED   → `itens_ok` / `itens_analisados`
 *
 *  DUAS COLUNAS DA PLANILHA NÃO VIERAM, e é decisão, não esquecimento:
 *
 *  A coluna `APPROVED (%)` de cada linha, que no arquivo é um `0` ou `1` somado
 *  no rodapé. Ela não é dado — é a implementação do SUM, e a linha já diz a
 *  mesma coisa no status. O agregado vive no cabeçalho e vem do SERVIDOR.
 *
 *  E a coluna oculta de orientação (a coluna I) não é uma coluna aqui: ela é a
 *  instrução do critério, e aparece embaixo do nome do item. Na planilha ela
 *  ficava à direita justamente para não ir junto quando o arquivo era mandado ao
 *  fornecedor; aqui a visibilidade é do portal, não da posição na grade.
 *
 *  O COMPORTAMENTO (carregar, gravar no blur, publicar) está em
 *  `components/planilha.tsx`, compartilhado com a planilha de LOD.
 */
import { Link, useParams } from 'react-router-dom'

import {
  BotaoStatus,
  CabecalhoPlanilha,
  CelulaNumero,
  CelulaTexto,
  Imagens,
  usePlanilha,
} from '@/components/planilha'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import type { Resultado } from '@/lib/types'
import { rotaProjeto } from '@/projeto/ProjetoContext'

export default function PlanilhaGeral() {
  const { projetoId, modeloId } = useParams<{ projetoId: string; modeloId: string }>()
  const { L, lang } = useI18n()
  const p = usePlanilha(modeloId, 'geral')

  if (p.carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const voltar = (
    <div className="crumb">
      <Link to={rotaProjeto(projetoId ?? '', 'auditoria/geral')}>
        {L('← Voltar ao controle', '← Back to control')}
      </Link>
    </div>
  )

  if (!p.modelo) {
    return (
      <>
        {voltar}
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('Modelo não encontrado', 'Model not found')}
          texto={L(
            'O modelo pode ter sido removido. Volte ao controle para ver a lista.',
            'The model may have been removed. Go back to the control list.',
          )}
        />
      </>
    )
  }

  if (!p.versao) {
    return (
      <>
        {voltar}
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('Sem versão para auditar', 'No version to audit')}
          texto={L(
            'Este modelo não tem versão registrada. A planilha nasce com a versão — registre a primeira na tela do modelo.',
            'This model has no registered version. The sheet is created with the version — register the first one on the model screen.',
          )}
        />
      </>
    )
  }

  if (!p.detalhe) {
    return (
      <>
        {voltar}
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('A auditoria geral não está aberta', 'The general audit is not open')}
          texto={L(
            'A disciplina deste modelo não declara a auditoria geral, ou esta versão é anterior à abertura automática. Abra pela tela do modelo.',
            'This model’s discipline does not declare the general audit, or this version predates automatic opening. Open it from the model screen.',
          )}
        />
      </>
    )
  }

  if (p.detalhe.resultados.length === 0) {
    return (
      <>
        {voltar}
        <Erro mensagem={p.erro} />
        <Vazio
          titulo={L('A planilha está sem linhas', 'The sheet has no rows')}
          texto={L(
            'A auditoria existe, mas o projeto não tem itens no checklist geral. Aplique os 17 itens de fábrica em Biblioteca de critérios › Compor checklist.',
            'The audit exists, but the project has no items in the general checklist. Apply the 17 factory items under Criteria library › Compose checklist.',
          )}
        />
      </>
    )
  }

  const travada = p.publicada

  return (
    <>
      <div className="crumb">
        <Link to={rotaProjeto(projetoId ?? '', 'auditoria/geral')}>
          {L('Controle', 'Control')}
        </Link>{' '}
        / <b>{p.modelo.codigo}</b>
      </div>

      <CabecalhoPlanilha versao={p.versao} detalhe={p.detalhe} />

      <div className="acoes">
        <span className="hint" style={{ margin: 0 }}>
          {L(
            'Cada campo salva ao sair dele — não há botão de salvar a planilha.',
            'Each field saves when you leave it — there is no save-sheet button.',
          )}
        </span>
        <div style={{ flex: 1 }} />
        <Link className="btn" to={rotaProjeto(projetoId ?? '', `modelos/${p.modelo.id}`)}>
          {L('Ver o modelo', 'Open the model')}
        </Link>
        {!travada && (
          <button
            className="btn pri"
            onClick={p.publicar}
            disabled={p.ocupado || p.detalhe.pendentes > 0}
            title={
              p.detalhe.pendentes > 0
                ? L(
                    `Ainda há ${p.detalhe.pendentes} item(ns) pendente(s)`,
                    `${p.detalhe.pendentes} item(s) still pending`,
                  )
                : undefined
            }
          >
            {L('Publicar round', 'Publish round')}
          </button>
        )}
      </div>

      <Erro mensagem={p.erro} />

      {travada && (
        <p className="hint">
          {L(
            'Round publicado — a planilha ficou somente leitura. Uma versão nova reabre a auditoria em outro round.',
            'Round published — the sheet is read-only. A new version reopens the audit in another round.',
          )}
        </p>
      )}

      {/* `overflowX` no card, como em `components/Matriz.tsx`: `.card` tem
          `overflow: hidden`, então sem isto a grade larga seria CORTADA em vez
          de rolar. E a rolagem fica aqui dentro — o corpo da página nunca rola
          de lado. */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="plan">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{L('Informação', 'Information')}</th>
              <th style={{ width: 132 }}>{L('Verificação', 'Verification')}</th>
              <th>{L('Comentário', 'Comentary')}</th>
              <th>{L('Direção', 'Direction')}</th>
              <th style={{ width: 118 }}>{L('Itens', 'Items')}</th>
              <th style={{ width: 150 }}>{L('Imagem', 'Image')}</th>
            </tr>
          </thead>
          <tbody>
            {p.detalhe.resultados.map((r: Resultado, i: number) => (
              <tr key={r.id}>
                <td className="co plan-num">{i + 1}</td>

                <td>
                  <div className="plan-nome">
                    {lang === 'pt' ? r.criterio.nome_pt : r.criterio.nome_en}
                  </div>
                  {/* A instrução é a coluna oculta da planilha: diz COMO
                      conferir o item. */}
                  {r.criterio.instrucao && (
                    <div className="plan-instrucao">{r.criterio.instrucao}</div>
                  )}
                  <div className="plan-codigo">
                    {r.criterio.codigo}
                    {r.origem === 'automatico' && (
                      <span className="auto a">{L('automático', 'automatic')}</span>
                    )}
                  </div>
                </td>

                <td>
                  <BotaoStatus
                    status={r.status}
                    travada={travada}
                    ocupado={p.ocupado}
                    onCiclar={() => p.ciclar(r)}
                  />
                  {/* Só no reprovado porque o backend só aceita aí — "só itens
                      reprovados geram não-conformidade". Um botão que devolve
                      409 é pior do que botão nenhum. */}
                  {r.status === 'reprovado' && !travada && (
                    <button
                      className="btn sm plan-nc"
                      onClick={() => p.gerarNc(r)}
                      disabled={p.ocupado}
                      title={L(
                        'Cria a não-conformidade com estas duas frases: comentário → descrição, direção → recomendação.',
                        'Creates the non-conformity from these two sentences: comment → description, direction → recommendation.',
                      )}
                    >
                      {L('Gerar NC', 'Raise NC')}
                    </button>
                  )}
                </td>

                <td>
                  <CelulaTexto
                    valor={r.comentario}
                    travada={travada}
                    dica={L('O que está errado', 'What is wrong')}
                    onSalvar={(comentario) => p.salvar(r, { comentario })}
                  />
                </td>

                <td>
                  <CelulaTexto
                    valor={r.direcao}
                    travada={travada}
                    dica={L('O que o fornecedor deve fazer', 'What the supplier must do')}
                    onSalvar={(direcao) => p.salvar(r, { direcao })}
                  />
                </td>

                {/* `ok / analisados` — a coluna ITEMS ANALYZED. Na planilha ela
                    é `1,0` em toda linha, porque lá cada item é um check e o
                    número não tem para onde variar. Aqui serve ao critério de
                    nível ELEMENTO, em que "12 de 340" é a resposta. */}
                <td>
                  <div className="plan-contagem">
                    <CelulaNumero
                      valor={r.itens_ok}
                      travada={travada}
                      rotulo={L('Itens conformes', 'Items OK')}
                      onSalvar={(itens_ok) => p.salvar(r, { itens_ok })}
                    />
                    <span className="co">/</span>
                    <CelulaNumero
                      valor={r.itens_analisados}
                      travada={travada}
                      rotulo={L('Itens analisados', 'Items analyzed')}
                      onSalvar={(itens_analisados) => p.salvar(r, { itens_analisados })}
                    />
                  </div>
                </td>

                <td>
                  <Imagens
                    resultado={r}
                    travada={travada}
                    onEnviar={(arquivo) => p.enviarEvidencia(r, arquivo)}
                    onAbrir={p.abrirEvidencia}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
