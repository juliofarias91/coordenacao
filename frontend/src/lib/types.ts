/** Tipos do domínio — espelham os schemas Pydantic do backend. */

export type MacroDisc = 'A' | 'C' | 'M' | 'S'
export type EmpresaTipo = 'propria' | 'terceirizada'
export type EmpresaPapel = 'trade' | 'bim' | 'fornecedor' | 'coordenacao'
/** A ordem é a da progressão real de LOD, e é a mesma do enum no Postgres.
 *  `lod300` e `lod350` entraram na migration 0004. */
export type ChecklistTipo = 'geral' | 'ifc' | '4d' | 'lod300' | 'lod350' | 'lod400' | 'lod500'
export type CriterioNivel = 'modelo' | 'elemento'
export type Automacao = 'auto' | 'design_automation' | 'manual'
/** `diretriz` e `setorizacao` vieram com a tela de PEB e moram na MESMA tabela
 *  dos outros: `standard.tipo` é coluna de texto, não enum do Postgres, então
 *  não custaram migration.
 *    diretriz     — regra do PEB. `nome` é o título, `referencia` é o texto.
 *    setorizacao  — imagem de um setor. `nome` é o setor, `referencia_url` é a
 *                   chave no S3.
 *    mandate      — exigência do contratante (BIM Mandate). Mesmo formato da
 *                   diretriz; o que separa as duas listas é o tipo. */
export type TipoStandard =
  | 'nomenclatura'
  | 'conjunto_esperado'
  | 'vocabulario'
  | 'mapeamento'
  | 'diretriz'
  | 'setorizacao'
  | 'mandate'

export type Page<T> = { itens: T[]; proximo_cursor: string | null }

type Base = { id: string; created_at: string; updated_at: string; org_id: string }

/** A organização não carrega `org_id`: ela própria é o tenant. */
export type Organizacao = {
  id: string
  created_at: string
  updated_at: string
  nome: string
  slug: string | null
  /** Se o `slug` acima serve de código para alguém criar a própria conta
   *  (migration 0016). Desligado por padrão — o slug não é segredo. */
  cadastro_aberto: boolean
}

export type ResumoOrganizacao = {
  organizacao: Organizacao
  projetos: number
  /** Quem contrata. Contado à parte de `empresas`, que é quem produz. */
  clientes: number
  usuarios: number
  usuarios_ativos: number
  empresas: number
}

/** Quem contrata a auditoria. Virou entidade na migration 0003 — antes era um
 *  campo de texto em `projeto`, o que fazia 'Microsoft' e 'microsoft' virarem
 *  duas pastas na home e não tinha onde guardar contato. */
export type Cliente = Base & {
  nome: string
  contato: string | null
  email: string | null
  status: string
}

/** Cliente com a contagem de projetos — o formato de `GET /clientes/pastas`. */
export type ClientePasta = Cliente & {
  projetos: number
}

export type Projeto = Base & {
  codigo: string
  nome: string
  cliente_id: string | null
  /** Derivado do relacionamento — a API resolve o nome para a tabela não
   *  precisar de uma consulta por linha. Quem escreve manda `cliente_id`. */
  cliente_nome: string | null
  coordenacao: string | null
  bep_ref: string | null
  status: string
  /** --- ficha cadastral (migration 0011) --- */
  descricao: string | null
  endereco: string | null
  data_inicio: string | null
  /** Previsão de conclusão — muda ao longo do contrato. SEPARADA da conclusão
   *  de fato: no mesmo campo, o atraso seria apagado pela própria atualização. */
  data_prevista: string | null
  data_conclusao: string | null
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
  /** AS TELAS QUE ESTA CONTA NÃO VÊ, sem o prefixo. Elas viajam na MESMA coluna
   *  de `permissoes` no banco (`oculta:<rota>`, ver `models/enums.py`) — o
   *  servidor as separa na saída para a tela não ter de fazê-lo, e o `permissoes`
   *  acima já chega limpo. Guarda as OCULTAS: tela nova nasce visível. */
  paginas_ocultas: string[]
  idioma: string
  status: string
}

/** O que a tela pública de definir senha sabe sobre o link que recebeu.
 *
 *  Devolver o login de um token válido não vaza nada — o token É a credencial.
 *  O que a tela ganha é dizer para qual conta a senha está sendo definida, em
 *  vez de pedir uma senha nova sem contexto. */
export type ConviteSenha = {
  login: string
  nome: string | null
  tipo: 'convite' | 'redefinicao'
  organizacao: string
  expira_em: string
  /** Vem do servidor: esta tela é pública e não tem outra forma de saber a
   *  regra antes de o usuário errá-la. */
  senha_minima: number
}

/** O que a tela de entrada sabe antes de haver sessão (`GET /auth/config`).
 *
 *  Não diz QUAL organização aceita cadastro: isso depende do código que a pessoa
 *  digita, e a tela só descobre ao enviá-lo. Responder aqui transformaria a rota
 *  pública numa lista de tenants da plataforma. */
export type ConfigPublica = {
  /** Há provedor OIDC ligado e configurado. */
  sso: boolean
  /** Nome do provedor, para o rótulo do botão ('Google', 'Autodesk', 'SSO'). */
  sso_rotulo: string
  senha_minima: number
}

/** A resposta de quem GERA o link. O token só existe aqui, uma vez. */
export type ConviteCriado = {
  token: string
  caminho: string
  tipo: 'convite' | 'redefinicao'
  expira_em: string
  usuario_id: string
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
  /** O nome por extenso, 'Estrutura metálica' (migration 0015). OPCIONAL: a
   *  identidade é o `codigo`, que é o que entra na nomenclatura do arquivo. */
  nome: string | null
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

/** Uma linha do gabarito DE FÁBRICA — a estrutura padrão, que mora em código
 *  (`services/gabarito.py`) e não no banco. Sem `id` e sem `projeto_id` de
 *  propósito: não é uma linha que se edite, é o padrão que a grade desenha. */
export type LinhaGabarito = {
  codigo: string
  nome_pt: string
  nome_en: string
  categoria: string
  instrucao: string | null
  criterio_aceitacao: string | null
  parametro_esperado: string | null
}

/** O que a aplicação do gabarito fez, em códigos de critério. As duas listas de
 *  "já existia" não são sobra: é como a tela diz o que foi PRESERVADO, já que
 *  o gabarito acrescenta e nunca sobrescreve o que o projeto ajustou. */
export type GabaritoAplicado = Checklist & {
  criterios_criados: string[]
  criterios_reaproveitados: string[]
  itens_criados: string[]
  itens_existentes: string[]
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
  /** O DIAGNÓSTICO — coluna COMENTARY da planilha ("há elementos em fases
   *  diferentes"). Texto interno da coordenação. */
  comentario: string | null
  /** A ORIENTAÇÃO — coluna DIRECTION ("alinhe todos os elementos à mesma
   *  fase"). É o que vai ao fornecedor, e o que a NC herda como recomendação.
   *  São dois campos porque são dois textos com destinatários diferentes. */
  direcao: string | null
  /** As três colunas da planilha de LOD (migration 0009). As duas primeiras são
   *  onde a informação FOI ENCONTRADA — diferente de
   *  `criterio.parametro_esperado`, que é onde ela DEVERIA estar. A terceira tem
   *  outro autor: `comentario` é da coordenação, esta é do fornecedor. */
  parametro_revit: string | null
  parametro_encontrado: string | null
  comentario_fornecedor: string | null
  itens_analisados: number | null
  itens_ok: number | null
  /** A coluna LOD da planilha de espec. VEM DE `checklist_item.min_lod`, não do
   *  resultado nem do critério: o mesmo critério pode ser exigido em LOD
   *  diferente conforme o checklist. Só o DETALHE da auditoria a traz — a
   *  resposta do PATCH de uma célula devolve `null`, e não faz falta, porque a
   *  tela recarrega o detalhe inteiro depois de gravar. */
  min_lod: string | null
  criterio: Criterio
  ocorrencias: Ocorrencia[]
  evidencias: Evidencia[]
}

/** O ANDAMENTO NÃO É O `estado` (migration 0013).
 *
 *  `estado` é publicação — quem o move é publicar um round, e ninguém o escolhe.
 *  `andamento` é o trabalho de quem audita, e é o que a gaveta de nova auditoria
 *  grava. Os dois convivem porque respondem perguntas diferentes: "o fornecedor
 *  já pode ver?" e "alguém está mexendo nisto?". */
export const ANDAMENTOS = ['a_fazer', 'em_andamento', 'concluida', 'bloqueada'] as const
export type Andamento = (typeof ANDAMENTOS)[number]

export const PRIORIDADES = ['alta', 'media', 'baixa'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

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
  /** A data PLANEJADA. Estava na tabela desde a migration 0001 e nunca havia
   *  chegado a tela nenhuma. */
  entrega_estimada: string | null
  publicado_em: string | null
  andamento: Andamento
  prioridade: Prioridade | null
}

export type AuditoriaDetalhe = Auditoria & { resultados: Resultado[]; pendentes: number }

/** Uma auditoria com o MODELO já resolvido — o que o painel da tela de auditoria
 *  lista dentro de cada tipo. Sem isto a barra faria uma requisição por linha só
 *  para escrever um nome. */
export type AuditoriaDaLista = Auditoria & {
  modelo_id: string | null
  modelo_codigo: string | null
  versao_rotulo: string | null
  auditor_nome: string | null
  /** A disciplina do modelo — é por ela que o painel agrupa dentro do recorte.
   *  Nula quando o modelo ainda não tem disciplina. */
  disciplina_codigo: string | null
  disciplina_nome: string | null
  /** De onde sai a COR do grupo: a paleta é por macrodisciplina, não por
   *  disciplina. */
  disciplina_macro: MacroDisc | null
}

/** O que a gaveta grava. `estado` NÃO está aqui de propósito: publicar é outro
 *  ato, com outra rota. */
export type PlanoAuditoria = {
  auditor_id?: string | null
  data_inicio?: string | null
  data_fim?: string | null
  entrega_estimada?: string | null
  andamento?: Andamento | null
  prioridade?: Prioridade | null
}

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
  tipo: NotifTipo
  mensagem: string
  origem: string | null
  lida: boolean
}

/** Espelha `NotifTipo` de `backend/app/models/enums.py`.
 *
 *  TEM NOME PRÓPRIO, e não é uma união inline no campo, porque
 *  `test_contrato.py` precisa de um identificador para citar — um tipo anônimo
 *  não pode ser travado contra o enum do backend.
 *
 *  `acesso` entrou com a redefinição de senha (migration 0010) e é a única que
 *  pede AÇÃO de quem administra; as outras três informam. */
export type NotifTipo = 'auditoria' | 'erro' | 'penalidade' | 'acesso'

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

/** Membro de um projeto (migration 0004).
 *
 *  REGISTRA PARTICIPAÇÃO, NÃO AUTORIZA. `papel` é o papel combinado NESTE
 *  projeto; `usuario_papel_org` é o da organização, e é ele que ainda decide o
 *  que a pessoa consegue fazer de fato. Os dois vêm juntos porque a pergunta
 *  de quem coordena é sobre o par. */
export type Membro = Base & {
  projeto_id: string
  usuario_id: string
  papel: string
  funcao: string | null
  /** COORDENAÇÃO, INOVAÇÃO, COMERCIAL (migration 0014). É por PROJETO: a mesma
   *  pessoa está em equipes diferentes em projetos diferentes. */
  equipe: string | null
  /** Resolvidos no servidor — a tela lista pessoas, não ids. */
  empresa_nome: string | null
  /** O status da CONTA (ativo / pendente), não do vínculo: quem foi convidado e
   *  ainda não definiu senha aparece pendente, que é o que explica a ausência. */
  usuario_status: string | null
  /** Só interessa na lista global, onde a linha precisa dizer de que projeto é. */
  projeto_codigo: string | null
  projeto_nome: string | null
  usuario_nome: string | null
  usuario_login: string | null
  usuario_papel_org: string | null
  /** As telas que esta pessoa NÃO vê. Vêm da CONTA, não do vínculo — e por isso
   *  valem em TODOS os projetos. A gaveta de membro as edita por
   *  `PUT /usuarios/{id}/paginas`, que funde as metades da coluna no servidor. */
  usuario_paginas_ocultas: string[]
}

/** Erro do SISTEMA reportado por quem usa (migration 0005).
 *
 *  NÃO confundir com `Apontamento`, que também é "apontamento de erro" na fala
 *  do dia a dia: aquele é do MODELO auditado e vira issue no ACC; este é da
 *  plataforma e vira trabalho de quem a mantém. */
export type ReporteErro = Base & {
  usuario_id: string | null
  titulo: string
  descricao: string | null
  /** A URL em que a pessoa estava. Preenchida pelo cliente, não digitada. */
  caminho: string | null
  print_url: string | null
  status: string
  resposta: string | null
  usuario_nome: string | null
  usuario_login: string | null
}

/** Uma linha da lixeira (migration 0006).
 *
 *  `tipo` é o nome da entidade na URL (`cliente`, `criterio`…), e é ele que a
 *  rota de restaurar recebe de volta. */
export type ItemLixeira = {
  tipo: string
  id: string
  rotulo: string
  removido_em: string
}

/* ---------------------------------------------------------------------------
   IMPORTAÇÃO DE PLANILHA — ponte provisória (migration 0012).

   Não se liga a `Auditoria` nem a `ResultadoCheck` de propósito: o importador
   lê os .xlsx que a coordenação preenche à mão e alimenta um dashboard próprio.
   Quando os dados forem para o caminho de auditoria de verdade, isto sai.
   --------------------------------------------------------------------------- */

export type PlanilhaImportada = {
  id: string
  /** 'geral' | 'lod300' */
  tipo: string
  arquivo: string
  disciplina: string
  modelo: string | null
  versao: string | null
  /** RECONTADA a partir das linhas — é esta que o dashboard soma. */
  aprovacao: number | null
  /** A que o Excel declara. Quando as duas divergem, a planilha errou a conta:
   *  numa das reais a fórmula soma o numerador até a linha 33 e o denominador
   *  até a 65. A tela mostra as duas lado a lado. */
  aprovacao_declarada: number | null
  itens: number
  aprovados: number
  created_at: string
}

export type RecusaImportacao = { arquivo: string; motivo: string }

export type ResultadoImportacao = {
  importadas: PlanilhaImportada[]
  /** O upload é tolerante a falha parcial: o que deu certo já está gravado. */
  recusadas: RecusaImportacao[]
}

/** Um recorte da média. `aprovacao` é PONDERADA pelos itens — uma planilha de
 *  191 linhas não pode pesar o mesmo que uma de 54. */
export type FatiaImportacao = {
  rotulo: string
  planilhas: number
  itens: number
  aprovados: number
  aprovacao: number | null
}

/** Um item que reprova em MAIS DE UMA planilha — a pergunta que a planilha
 *  isolada não responde: "o que está errado em todo mundo?". */
export type ItemCriticoImportacao = {
  tipo: string
  item: string
  ocorrencias: number
  reprovacoes: number
  taxa: number
}

export type DashboardImportacao = {
  total: FatiaImportacao
  por_tipo: FatiaImportacao[]
  por_disciplina: FatiaImportacao[]
  criticos: ItemCriticoImportacao[]
  planilhas: PlanilhaImportada[]
}
