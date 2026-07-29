/** A planilha do LOD 300 — a aba `Spec Audit LOD300_<DISC>`.
 *
 *  Referência: `AUDITORIA\LOD 300\Spec Audit LOD300_STRC.pdf` e a planilha ao
 *  lado. 60 linhas em 4 categorias de elemento, para STRC.
 *
 *  A DIFERENÇA COM A PLANILHA GERAL É A ESTRUTURA, não o comportamento. Lá são
 *  17 itens chapados; aqui é ELEMENTO × INFORMAÇÃO, e o elemento agrupa. Por
 *  isso a linha do grupo atravessa a tabela e o número da linha reinicia dentro
 *  dela: quem audita percorre "a laje toda, depois os pilares", e uma numeração
 *  contínua de 1 a 60 não ajudaria a achar onde parou.
 *
 *  AS COLUNAS, e de onde cada uma vem:
 *
 *    ELEMENT              → `criterio.categoria`, o cabeçalho do grupo
 *    INFORMATION          → o nome do critério
 *    BIM FORUM DESCRIPTION→ `criterio.criterio_aceitacao`, sob o nome
 *    REVIT PARAMETER      → `parametro_revit` (0009)
 *    PARAMETER            → `parametro_encontrado` (0009)
 *    VERIFICATION         → o status
 *    COMMENTS             → `comentario`, da coordenação
 *    SUPPLIERS COMMENTS   → `comentario_fornecedor` (0009)
 *
 *  AS DUAS COLUNAS DE PARÂMETRO SÃO RESPOSTA, não requisito. O guia do arquivo
 *  é explícito: "parâmetro nativo do Revit UTILIZADO". Onde a informação
 *  DEVERIA estar é `criterio.parametro_esperado`, que a tela mostra ao lado do
 *  nome como referência — é a comparação entre os dois que responde a única
 *  pergunta que a planilha existe para fazer: a informação está no lugar certo?
 *
 *  `SUPPLIERS COMMENTS` tem OUTRO AUTOR e por isso é outro campo: o guia diz
 *  "permissão de edição: FORNECEDORES". Aqui a coordenação a vê e a preenche
 *  pela coordenação quando transcreve a resposta; quando o portal do fornecedor
 *  ganhar escrita, é este campo que ele escreve.
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

/** Agrupa por `criterio.categoria` PRESERVANDO a ordem em que os resultados
 *  vieram — que é a ordem do `ChecklistItem.ordem`, que é a ordem do arquivo.
 *  Um `sort` aqui embaralharia as categorias em relação à planilha impressa. */
function agrupar(resultados: Resultado[]): Array<[string, Resultado[]]> {
  const grupos = new Map<string, Resultado[]>()
  for (const r of resultados) {
    const chave = r.criterio.categoria ?? ''
    const atual = grupos.get(chave)
    if (atual) atual.push(r)
    else grupos.set(chave, [r])
  }
  return [...grupos]
}

export default function PlanilhaLod() {
  const { projetoId, modeloId } = useParams<{ projetoId: string; modeloId: string }>()
  const { L, lang } = useI18n()
  const p = usePlanilha(modeloId, 'lod300')

  if (p.carregando) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  const voltar = (
    <div className="crumb">
      <Link to={rotaProjeto(projetoId ?? '', 'auditoria/lod300')}>
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
            'Este modelo não tem versão registrada. Registre a primeira na tela do modelo.',
            'This model has no registered version. Register the first one on the model screen.',
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
          titulo={L('A auditoria LOD 300 não está aberta', 'The LOD 300 audit is not open')}
          texto={L(
            'Diferente da geral, a de LOD não abre sozinha: ela é trabalho dirigido, e começa quando a coordenação decide começar. Abra em Modelos › o modelo › Abrir auditorias — a disciplina precisa declarar LOD 300.',
            'Unlike the general audit, LOD audits do not open on their own: they are directed work, started when coordination decides to. Open it under Models › the model › Open audits — the discipline must declare LOD 300.',
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
            'A auditoria existe, mas o projeto não tem itens no checklist LOD 300. Aplique o gabarito da disciplina em Biblioteca de critérios › Compor checklist.',
            'The audit exists, but the project has no items in the LOD 300 checklist. Apply the discipline template under Criteria library › Compose checklist.',
          )}
        />
      </>
    )
  }

  const travada = p.publicada
  const grupos = agrupar(p.detalhe.resultados)

  return (
    <>
      <div className="crumb">
        <Link to={rotaProjeto(projetoId ?? '', 'auditoria/lod300')}>
          {L('Controle', 'Control')}
        </Link>{' '}
        / <b>{p.modelo.codigo}</b>
      </div>

      <CabecalhoPlanilha versao={p.versao} detalhe={p.detalhe} />

      <div className="acoes">
        <span className="hint" style={{ margin: 0 }}>
          {L(
            `${grupos.length} categoria(s) de elemento · cada campo salva ao sair dele`,
            `${grupos.length} element category(ies) · each field saves when you leave it`,
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
            'Round publicado — a planilha ficou somente leitura.',
            'Round published — the sheet is read-only.',
          )}
        </p>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="plan">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>{L('Informação', 'Information')}</th>
              <th style={{ width: 132 }}>{L('Verificação', 'Verification')}</th>
              <th style={{ width: 150 }}>{L('Parâmetro Revit', 'Revit parameter')}</th>
              <th style={{ width: 150 }}>{L('Parâmetro', 'Parameter')}</th>
              <th>{L('Comentário', 'Comments')}</th>
              <th>{L('Do fornecedor', 'Supplier’s')}</th>
              <th style={{ width: 110 }}>{L('Itens', 'Items')}</th>
              <th style={{ width: 130 }}>{L('Imagem', 'Image')}</th>
            </tr>
          </thead>
          {grupos.map(([categoria, linhas]) => (
            <tbody key={categoria}>
              {/* A linha do grupo é a coluna ELEMENT da planilha. Atravessa a
                  tabela porque ela não é dado de uma coluna — é o assunto das
                  linhas abaixo dela. */}
              <tr className="plan-grupo">
                <th colSpan={9}>
                  {categoria || L('Sem categoria', 'Uncategorized')}
                  <span className="co"> · {linhas.length}</span>
                </th>
              </tr>
              {linhas.map((r, i) => (
                <tr key={r.id}>
                  <td className="co plan-num">{i + 1}</td>

                  <td>
                    <div className="plan-nome">
                      {lang === 'pt' ? r.criterio.nome_pt : r.criterio.nome_en}
                    </div>
                    {/* A BIM FORUM DESCRIPTION: o que faz o item passar. */}
                    {r.criterio.criterio_aceitacao && (
                      <div className="plan-instrucao">{r.criterio.criterio_aceitacao}</div>
                    )}
                    {/* Onde a informação DEVERIA estar. É a referência contra a
                        qual as duas colunas de parâmetro são lidas. */}
                    {r.criterio.parametro_esperado && (
                      <div className="plan-esperado">
                        {L('esperado:', 'expected:')} <b>{r.criterio.parametro_esperado}</b>
                      </div>
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
                    {r.status === 'reprovado' && !travada && (
                      <button
                        className="btn sm plan-nc"
                        onClick={() => p.gerarNc(r)}
                        disabled={p.ocupado}
                      >
                        {L('Gerar NC', 'Raise NC')}
                      </button>
                    )}
                  </td>

                  <td>
                    <CelulaTexto
                      valor={r.parametro_revit}
                      travada={travada}
                      linhas={1}
                      dica={L('built-in usado', 'built-in used')}
                      onSalvar={(parametro_revit) => p.salvar(r, { parametro_revit })}
                    />
                  </td>

                  <td>
                    <CelulaTexto
                      valor={r.parametro_encontrado}
                      travada={travada}
                      linhas={1}
                      dica={L('não nativo', 'non-native')}
                      onSalvar={(parametro_encontrado) =>
                        p.salvar(r, { parametro_encontrado })
                      }
                    />
                  </td>

                  <td>
                    <CelulaTexto
                      valor={r.comentario}
                      travada={travada}
                      dica={L('da coordenação', 'from coordination')}
                      onSalvar={(comentario) => p.salvar(r, { comentario })}
                    />
                  </td>

                  <td>
                    <CelulaTexto
                      valor={r.comentario_fornecedor}
                      travada={travada}
                      dica={L('do fornecedor', 'from the supplier')}
                      onSalvar={(comentario_fornecedor) =>
                        p.salvar(r, { comentario_fornecedor })
                      }
                    />
                  </td>

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
          ))}
        </table>
      </div>
    </>
  )
}
