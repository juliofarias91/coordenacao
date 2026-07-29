/** Cadastro de modelo — o formulário do protótipo (`modelEditor`), com a
 *  versão inicial junto.
 *
 *  DUAS CHAMADAS, uma intenção. O backend separa modelo de versão
 *  (`POST /modelos`, depois `POST /modelos/{id}/versoes`) porque um modelo vive
 *  muitos rounds; quem cadastra, porém, está registrando "o modelo tal, na V1".
 *  Pedir dois formulários seguidos para isso deixaria modelos sem versão
 *  nenhuma no meio do caminho — e modelo sem versão não tem o que auditar.
 *
 *  A DISCIPLINA É O ELO, e é dela que quase tudo vem: o código do arquivo, o
 *  projetista sugerido, os checklists que a auditoria vai abrir, as áreas do
 *  escopo e o padrão de nomenclatura. O quadro "Herdado da disciplina" mostra
 *  isso ANTES de criar, porque é o que o usuário não consegue prever — e é
 *  onde ele descobre que escolheu a disciplina errada.
 *
 *  Deriva do protótipo em tudo menos num campo: onde ele tinha "Status"
 *  (publicado / não publicado), aqui há FORMATO. Publicação, neste sistema, é
 *  ato do round — sai de `POST /auditorias/{id}/publicar`, não do cadastro — e
 *  não existiria como escolher aqui. Formato, ao contrário, é obrigatório na
 *  versão e o protótipo não o tinha porque não lidava com arquivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Campo, Editor } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'
import type { Disciplina, Empresa, Standard } from '@/lib/types'

/** `PROJETO-DISC-SUB-SETOR`, a mesma junção do protótipo (`modelSyncCode`).
 *
 *  O `macro` NÃO entra: ele já está embutido no par disc/sub da disciplina, e
 *  repeti-lo produziria `CPQ11-C-STRC-STEEL-...` onde o padrão do projeto
 *  espera `CPQ11-STRC-STEEL-...`. Quem manda no formato final é o standard de
 *  nomenclatura da disciplina — daí o campo continuar editável. */
function montarCodigo(projetoCodigo: string, d: Disciplina | undefined, setor: string): string {
  if (!d) return ''
  return [projetoCodigo, d.disc, d.sub, setor || 'DATA'].filter(Boolean).join('-').toUpperCase()
}

type Rascunho = {
  disciplina_id: string
  setor: string
  codigo: string
  instaladora_id: string
  modeladora_id: string
  versao: string
  formato: 'ifc' | 'revit'
}

export default function NovoModelo({
  projetoId,
  projetoCodigo,
  onCriado,
  onCancelar,
}: {
  projetoId: string
  projetoCodigo: string
  onCriado: () => void
  onCancelar: () => void
}) {
  const { L } = useI18n()

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** O usuário mexeu no código à mão? A partir daí a sincronização automática
   *  para de sobrescrever — senão trocar o setor apagaria o que ele digitou. */
  const [codigoManual, setCodigoManual] = useState(false)

  useEffect(() => {
    Promise.all([
      api.disciplinas.listar(projetoId),
      api.empresas.listar(),
      api.standards.listar(projetoId).catch(() => ({ itens: [] as Standard[] })),
    ])
      .then(([ds, es, ss]) => {
        setDisciplinas(ds.itens)
        setEmpresas(es.itens)
        setStandards(ss.itens)
        const primeira = ds.itens[0]
        setRascunho({
          disciplina_id: primeira?.id ?? '',
          setor: 'DATA',
          codigo: montarCodigo(projetoCodigo, primeira, 'DATA'),
          // Instaladora e modelagem nascem do PROJETISTA da disciplina, como no
          // protótipo: na maioria dos casos são a mesma empresa, e pré-preencher
          // poupa duas escolhas de quem cadastra dez modelos seguidos.
          instaladora_id: primeira?.projetista_id ?? '',
          modeladora_id: primeira?.projetista_id ?? '',
          versao: 'V1',
          formato: 'ifc',
        })
      })
      .catch((e) => setErro(e instanceof ApiError ? e.message : String(e)))
  }, [projetoId, projetoCodigo])

  const disciplina = useMemo(
    () => disciplinas.find((d) => d.id === rascunho?.disciplina_id),
    [disciplinas, rascunho?.disciplina_id],
  )

  const trocarDisciplina = useCallback(
    (id: string) => {
      const d = disciplinas.find((x) => x.id === id)
      setRascunho((atual) =>
        atual
          ? {
              ...atual,
              disciplina_id: id,
              instaladora_id: d?.projetista_id ?? '',
              modeladora_id: d?.projetista_id ?? '',
              codigo: codigoManual ? atual.codigo : montarCodigo(projetoCodigo, d, atual.setor),
            }
          : atual,
      )
    },
    [disciplinas, projetoCodigo, codigoManual],
  )

  const trocarSetor = useCallback(
    (valor: string) => {
      const setor = valor.toUpperCase()
      setRascunho((atual) =>
        atual
          ? {
              ...atual,
              setor,
              codigo: codigoManual ? atual.codigo : montarCodigo(projetoCodigo, disciplina, setor),
            }
          : atual,
      )
    },
    [disciplina, projetoCodigo, codigoManual],
  )

  async function salvar() {
    if (!rascunho) return
    setErro(null)

    if (!rascunho.disciplina_id) {
      setErro(L('Escolha uma disciplina.', 'Pick a discipline.'))
      return
    }
    if (!rascunho.codigo.trim()) {
      setErro(L('Informe o código do modelo.', 'Enter the model code.'))
      return
    }

    setSalvando(true)
    try {
      const modelo = await api.modelos.criar({
        projeto_id: projetoId,
        codigo: rascunho.codigo.trim(),
        disciplina_id: rascunho.disciplina_id,
        instaladora_id: rascunho.instaladora_id || null,
        modeladora_id: rascunho.modeladora_id || null,
      })

      // A versão vai em seguida, e uma falha AQUI é o caso chato: o modelo já
      // existe. Em vez de deixar o usuário achando que nada foi criado, a
      // mensagem diz o que ficou de pé e o que fazer — recadastrar com o mesmo
      // código daria 409 e ele não saberia por quê.
      try {
        await api.modelos.criarVersao(modelo.id, {
          versao: rascunho.versao.trim() || 'V1',
          formato: rascunho.formato,
        })
      } catch (e) {
        const detalhe = e instanceof ApiError ? e.message : String(e)
        setErro(
          L(
            `O modelo ${modelo.codigo} foi criado, mas a versão inicial não: ${detalhe}. Abra o modelo e cadastre a versão por lá.`,
            `Model ${modelo.codigo} was created, but the initial version was not: ${detalhe}. Open the model and add the version there.`,
          ),
        )
        setSalvando(false)
        return
      }

      onCriado()
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
      setSalvando(false)
    }
  }

  if (!rascunho) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  if (disciplinas.length === 0) {
    return (
      <div className="editor">
        <h3>{L('Novo modelo', 'New model')}</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          {L(
            'Este projeto ainda não tem disciplinas, e é a disciplina que define o código do arquivo, os checklists da auditoria e as áreas do escopo. Cadastre-as em Configurações do projeto › Disciplinas.',
            'This project has no disciplines yet, and the discipline is what defines the file code, the audit checklists and the scoped areas. Register them under Project setup › Disciplines.',
          )}
        </p>
        <div className="eact">
          <button className="btn" onClick={onCancelar}>
            {L('Fechar', 'Close')}
          </button>
        </div>
      </div>
    )
  }

  const nomeEmpresa = (id: string | null | undefined) =>
    empresas.find((e) => e.id === id)?.nome ?? '—'
  const nomeStandard = (id: string | null | undefined) =>
    standards.find((s) => s.id === id)?.nome ?? '—'

  return (
    <Editor
      titulo={L('Novo modelo', 'New model')}
      onSalvar={salvar}
      onCancelar={onCancelar}
      salvando={salvando}
      erro={erro}
    >
      <Campo rotulo={L('Disciplina', 'Discipline')}>
        <select
          className="f"
          value={rascunho.disciplina_id}
          onChange={(e) => trocarDisciplina(e.target.value)}
        >
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.codigo} · {d.macro}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo={L('Setor / sufixo', 'Sector / suffix')}>
        <input
          className="f"
          placeholder="DATA / SITE"
          value={rascunho.setor}
          onChange={(e) => trocarSetor(e.target.value)}
        />
      </Campo>

      <Campo rotulo={L('Código do modelo', 'Model code')} largo>
        <input
          className="f code"
          value={rascunho.codigo}
          onChange={(e) => {
            // Mexeu à mão: a sincronização automática para aqui. O padrão de
            // nomenclatura do projeto pode exigir uma forma que a junção
            // automática não produz, e sobrescrever seria desfazer o ajuste.
            setCodigoManual(true)
            setRascunho({ ...rascunho, codigo: e.target.value.toUpperCase() })
          }}
        />
      </Campo>

      <Campo rotulo={L('Instaladora', 'Installer')}>
        <select
          className="f"
          value={rascunho.instaladora_id}
          onChange={(e) => setRascunho({ ...rascunho, instaladora_id: e.target.value })}
        >
          <option value="">{L('— nenhuma —', '— none —')}</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nome}
            </option>
          ))}
        </select>
      </Campo>

      {/* Seletor, e não texto livre como no protótipo: modeladora é EMPRESA no
          nosso modelo, e guardar o nome digitado repetiria o problema que fez o
          cliente virar entidade — 'Mendes Holler' e 'mendes holler' viram duas. */}
      <Campo rotulo={L('Modelagem (autoria)', 'Modeling (authoring)')}>
        <select
          className="f"
          value={rascunho.modeladora_id}
          onChange={(e) => setRascunho({ ...rascunho, modeladora_id: e.target.value })}
        >
          <option value="">{L('— nenhuma —', '— none —')}</option>
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nome}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo={L('Versão inicial', 'Initial version')}>
        <input
          className="f"
          value={rascunho.versao}
          onChange={(e) => setRascunho({ ...rascunho, versao: e.target.value.toUpperCase() })}
        />
      </Campo>

      <Campo rotulo={L('Formato', 'Format')}>
        <select
          className="f"
          value={rascunho.formato}
          onChange={(e) =>
            setRascunho({ ...rascunho, formato: e.target.value as Rascunho['formato'] })
          }
        >
          <option value="ifc">IFC</option>
          <option value="revit">Revit</option>
        </select>
      </Campo>

      {/* O QUE VEM DE GRAÇA COM A DISCIPLINA — e é o que o usuário não consegue
          prever. É aqui que ele percebe que escolheu a disciplina errada, antes
          de criar e ter de apagar. */}
      <div className="modelo-herdado full">
        <b>
          {L('Herdado da disciplina', 'Inherited from discipline')} {disciplina?.codigo}
        </b>
        <div>
          {L('Projetista', 'Designer')}: <b>{nomeEmpresa(disciplina?.projetista_id)}</b> ·{' '}
          {L('Auditorias', 'Audits')}:{' '}
          <b>{disciplina?.checklists.length ? disciplina.checklists.join(', ') : '—'}</b>
        </div>
        <div>
          {L('Áreas', 'Areas')}: <b>{disciplina?.areas.length ? disciplina.areas.join(', ') : '—'}</b>{' '}
          · {L('Nomenclatura', 'Nomenclature')}: <b>{nomeStandard(disciplina?.nomenclatura_id)}</b>
        </div>
      </div>
    </Editor>
  )
}
