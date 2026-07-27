/** Tipos do domínio — espelham os schemas Pydantic do backend. */

export type MacroDisc = 'A' | 'C' | 'M' | 'S'
export type EmpresaTipo = 'propria' | 'terceirizada'
export type EmpresaPapel = 'trade' | 'bim' | 'fornecedor' | 'coordenacao'
export type ChecklistTipo = 'geral' | 'ifc' | '4d' | 'lod400' | 'lod500'
export type CriterioNivel = 'modelo' | 'elemento'
export type Automacao = 'auto' | 'design_automation' | 'manual'
export type TipoStandard = 'nomenclatura' | 'conjunto_esperado' | 'vocabulario' | 'mapeamento'

export type Page<T> = { itens: T[]; proximo_cursor: string | null }

type Base = { id: string; created_at: string; updated_at: string; org_id: string }

/** A organização não carrega `org_id`: ela própria é o tenant. */
export type Organizacao = {
  id: string
  created_at: string
  updated_at: string
  nome: string
  slug: string | null
}

export type ResumoOrganizacao = {
  organizacao: Organizacao
  projetos: number
  usuarios: number
  usuarios_ativos: number
  empresas: number
}

export type Projeto = Base & {
  codigo: string
  nome: string
  cliente: string | null
  cliente_contato: string | null
  coordenacao: string | null
  bep_ref: string | null
  status: string
}

export type Contato = Base & {
  empresa_id: string
  nome: string | null
  cargo: string | null
  email: string | null
  telefone: string | null
  departamento: string | null
  disciplina: string | null
}

export type Empresa = Base & {
  nome: string
  cnpj: string | null
  tipo: EmpresaTipo
  contratada_por: string | null
  papeis: EmpresaPapel[]
  ferramenta: string | null
  departamento: string | null
  disciplinas: string | null
  logo_url: string | null
  status: string
  penalidades: number
}

export type EmpresaDetalhe = Empresa & { contatos: Contato[] }

export type UsuarioCadastro = Base & {
  login: string
  nome: string | null
  papel: string
  empresa_id: string | null
  permissoes: string[]
  idioma: string
  status: string
}

export type Standard = Base & {
  projeto_id: string
  nome: string
  tipo: TipoStandard
  referencia: string | null
  conteudo: Record<string, unknown> | null
  referencia_url: string | null
}

export type Segmento = { k: string; vals: string[]; opcional?: boolean }

export type Nomenclatura = Base & {
  projeto_id: string
  segmentos: Segmento[]
  vigente: boolean
}

export type Disciplina = Base & {
  projeto_id: string
  codigo: string
  macro: MacroDisc
  disc: string
  sub: string
  projetista_id: string | null
  checklists: ChecklistTipo[]
  nomenclatura_id: string | null
  areas: string[]
  cor_macro: string
}

export type Criterio = Base & {
  projeto_id: string
  codigo: string
  nome_pt: string
  nome_en: string
  categoria: string | null
  nivel: CriterioNivel
  automacao: Automacao
  standard_id: string | null
  parametro_esperado: string | null
  criterio_aceitacao: string | null
  instrucao: string | null
  referencia_url: string | null
}

export type CriterioComUso = Criterio & { usos: number }

export type ItemChecklist = Base & {
  projeto_id: string
  checklist: ChecklistTipo
  criterio_id: string
  ordem: number | null
  obrigatorio: boolean
  fase: string | null
  min_lod: string | null
  min_loi: string | null
  instrucao_override: string | null
  peso: number
  criterio: Criterio
}

export type Checklist = {
  checklist: ChecklistTipo
  projeto_id: string
  itens: ItemChecklist[]
}

export type Permissao = { codigo: string; papeis_padrao: string[] }

// ------------------------------------------------------------------ fase 2
export type VersaoFormato = 'revit' | 'ifc'
export type CheckStatus = 'aprovado' | 'reprovado' | 'pendente' | 'na'
export type AuditoriaEstado = 'publicado' | 'nao_publicado' | 'desatualizado'

export type Modelo = Base & {
  projeto_id: string
  codigo: string
  disciplina_id: string | null
  instaladora_id: string | null
  modeladora_id: string | null
  acc_item_id: string | null
}

export type Versao = Base & {
  modelo_id: string
  versao: string
  round: number | null
  formato: VersaoFormato
  autoria: string | null
  acc_version: string | null
  arquivo_url: string | null
  urn: string | null
  publicado_em: string | null
}

export type ModeloDetalhe = Modelo & { versoes: Versao[] }

export type Ocorrencia = Base & {
  resultado_id: string
  element_id: string
  detalhe: string | null
}

export type Evidencia = Base & {
  resultado_id: string
  arquivo_url: string
  legenda: string | null
}

export type Resultado = Base & {
  auditoria_id: string
  criterio_id: string
  status: CheckStatus
  origem: 'automatico' | 'manual'
  comentario: string | null
  itens_analisados: number | null
  itens_ok: number | null
  criterio: Criterio
  ocorrencias: Ocorrencia[]
  evidencias: Evidencia[]
}

export type Auditoria = Base & {
  versao_id: string
  checklist: ChecklistTipo
  area: string | null
  round: number | null
  estado: AuditoriaEstado
  aprovacao_pct: string | null
  auditor_id: string | null
  revisado_por: string | null
  data_inicio: string | null
  data_fim: string | null
  publicado_em: string | null
}

export type AuditoriaDetalhe = Auditoria & { resultados: Resultado[]; pendentes: number }

export type Comentario = Base & { nc_id: string; usuario_id: string | null; texto: string | null }

export type NaoConformidade = Base & {
  auditoria_id: string
  criterio_id: string | null
  resultado_id: string | null
  descricao: string | null
  recomendacao: string | null
  elementos: string | null
  responsavel_id: string | null
  prazo: string | null
  status: string
  comentarios: Comentario[]
}

export type ResumoChecklist = {
  checklist: ChecklistTipo
  auditoria_id: string
  estado: AuditoriaEstado
  aprovacao_pct: string | null
  round: number | null
}

export type LinhaPainel = {
  modelo_id: string
  codigo: string
  disciplina_codigo: string | null
  macro: MacroDisc | null
  cor_macro: string | null
  instaladora: string | null
  modeladora: string | null
  versao: string | null
  versao_id: string | null
  formato: string | null
  round: number | null
  estado: AuditoriaEstado | null
  aprovacao_pct: string | null
  publicado_em: string | null
  ncs_abertas: number
  checklists: ResumoChecklist[]
}

export type Painel = {
  projeto_id: string
  resumo: {
    total_modelos: number
    publicados: number
    desatualizados: number
    nao_publicados: number
    aprovacao_media: number | null
    ncs_abertas: number
  }
  linhas: LinhaPainel[]
}

export type CelulaMatriz = {
  auditoria_id: string | null
  aprovacao_pct: number | null
  estado: AuditoriaEstado | null
  round: number | null
} | null

export type LinhaMatriz = {
  modelo_id: string
  codigo: string
  disciplina_codigo: string
  macro: MacroDisc
  cor_macro: string | null
  versao: string | null
  celulas: Record<string, CelulaMatriz>
}

export type Matriz = {
  projeto_id: string
  checklist: ChecklistTipo
  areas: string[]
  linhas: LinhaMatriz[]
}

export type StatusIntegracao = { configurado: boolean; detalhe: string }

// ------------------------------------------------------------------ fase 3
export type SegmentoAvaliado = {
  k: string
  valor: string
  ok: boolean
  esperados: string[]
  motivo: string | null
}

export type VeredictoNome = {
  ok: boolean
  nome: string
  padrao: string
  mensagem: string
  segmentos: SegmentoAvaliado[]
  penalidade_id: string | null
}

export type Penalidade = Base & {
  empresa_id: string
  motivo: string
  peso: number
  referencia: string | null
}

export type Notificacao = Base & {
  usuario_id: string | null
  papel_alvo: string | null
  tipo: 'auditoria' | 'erro' | 'penalidade'
  mensagem: string
  origem: string | null
  lida: boolean
}

export type Fatia = { rotulo: string; valor: number; cor: string | null; chave: string | null }

export type PontoEvolucao = {
  round: number
  aprovacao_media: number | null
  auditorias: number
}

export type KPIs = {
  projeto_id: string
  modelos: number
  versoes: number
  auditorias_publicadas: number
  aprovacao_media: string | null
  ncs_abertas: number
  ncs_resolvidas: number
  por_macro: Fatia[]
  por_estado: Fatia[]
  por_status_de_item: Fatia[]
  evolucao: PontoEvolucao[]
  criterios_mais_reprovados: Fatia[]
}

export type LinhaPlacar = {
  empresa_id: string
  empresa: string
  modelos: number
  aprovacao_media: string | null
  ncs_abertas: number
  penalidades: number
  /** Nulo quando `avaliado` é falso — a empresa ainda não teve nada auditado. */
  indice: string | null
  avaliado: boolean
}

export type Placar = { projeto_id: string; linhas: LinhaPlacar[]; formula: string }

export type Apontamento = Base & {
  projeto_id: string
  codigo: string | null
  titulo: string
  modelo_id: string | null
  disciplina: string | null
  prioridade: string | null
  status: string
  responsavel_id: string | null
  descricao: string | null
  acc_issue_id: string | null
}

export type Convite = Base & {
  projeto_id: string
  cliente_nome: string | null
  cliente_email: string | null
  secoes: Record<string, boolean> | null
  colunas: Record<string, boolean> | null
  token: string
  ativo: boolean
}

export type LinhaTrilha = {
  id: string
  created_at: string
  usuario_id: string | null
  entidade: string | null
  entidade_id: string | null
  acao: string | null
  diff: Record<string, unknown> | null
}

export type ContadorNotificacoes = { nao_lidas: number; por_tipo: Record<string, number> }

export type Execucao = {
  versao_id: string
  auditorias: string[]
  avaliados: number
  aprovados: number
  reprovados: number
  na: number
  preservados: number
  sem_verificador: number
  erros: string[]
  resumo: string
}
