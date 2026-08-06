/**
 * Cliente HTTP da API.
 *
 * Guarda o par de tokens, injeta o Bearer e, em 401, tenta um refresh e
 * repete a chamada uma única vez. O `org_id` nunca sai daqui: ele vive dentro
 * do access token e é o backend que o injeta em toda query.
 */

import type * as T from '@/lib/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const CHAVE_TOKENS = 'spbim_tokens'

export type Papel =
  | 'admin'
  | 'coordenador'
  | 'auditor'
  | 'revisor'
  | 'fornecedor'
  | 'leitor'
  | 'cliente'

export type Usuario = {
  id: string
  org_id: string
  login: string
  nome: string | null
  papel: Papel
  empresa_id: string | null
  permissoes: string[]
  /** As telas que esta conta não vê — o que a barra lateral não desenha. Não é
   *  permissão: a API decide pelo `permissoes` acima. Ver `models/enums.py`. */
  paginas_ocultas: string[]
  idioma: string
}

export type TokenPair = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export type Sessao = { tokens: TokenPair; usuario: Usuario }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Um item do `detail` de um 422 do FastAPI. */
type ErroDeValidacao = { msg?: unknown; loc?: unknown[] }

/** Uma linha de erro de validação em português de gente.
 *
 *  O `detail` de um 422 do Pydantic é uma lista de OBJETOS
 *  (`{type, loc, msg, input}`), e `String(objeto)` devolve `[object Object]` —
 *  era literalmente o que a tela mostrava a quem digitasse uma senha curta
 *  demais. O `loc` vem como `['body', 'senha']`; o `'body'` é ruído de
 *  protocolo e sai.
 */
function linhaDeValidacao(item: unknown): string {
  if (!item || typeof item !== 'object') return String(item)
  const { msg, loc } = item as ErroDeValidacao
  if (msg === undefined) return JSON.stringify(item)
  const campo = Array.isArray(loc)
    ? loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path').join('.')
    : ''
  return campo ? `${campo}: ${String(msg)}` : String(msg)
}

// -------------------------------------------------------------- tokens
export function lerTokens(): TokenPair | null {
  try {
    const cru = localStorage.getItem(CHAVE_TOKENS)
    return cru ? (JSON.parse(cru) as TokenPair) : null
  } catch {
    return null
  }
}

export function gravarTokens(tokens: TokenPair | null): void {
  try {
    if (tokens) localStorage.setItem(CHAVE_TOKENS, JSON.stringify(tokens))
    else localStorage.removeItem(CHAVE_TOKENS)
  } catch {
    /* localStorage indisponível — a sessão dura só esta aba */
  }
}

// --------------------------------------------------------------- fetch
async function extrairErro(resp: Response): Promise<string> {
  try {
    const corpo = await resp.json()
    if (typeof corpo?.detail === 'string') return corpo.detail
    if (Array.isArray(corpo?.detail)) return corpo.detail.map(linhaDeValidacao).join('; ')
  } catch {
    /* corpo não era JSON */
  }
  return `${resp.status} ${resp.statusText}`
}

async function bruto(caminho: string, init: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init.headers)
  // Só JSON: para FormData o browser precisa definir o boundary do multipart.
  if (!headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${BASE}${caminho}`, { ...init, headers })
}

async function renovar(): Promise<TokenPair | null> {
  const atuais = lerTokens()
  if (!atuais) return null
  const resp = await bruto('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: atuais.refresh_token }),
  })
  if (!resp.ok) {
    gravarTokens(null)
    return null
  }
  const novos = (await resp.json()) as TokenPair
  gravarTokens(novos)
  return novos
}

export async function requisitar<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const tokens = lerTokens()
  let resp = await bruto(caminho, init, tokens?.access_token)

  if (resp.status === 401 && tokens) {
    const novos = await renovar()
    if (novos) resp = await bruto(caminho, init, novos.access_token)
  }

  if (!resp.ok) throw new ApiError(resp.status, await extrairErro(resp))
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

// ------------------------------------------------------------ endpoints
function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

const escrever = <T,>(caminho: string, metodo: 'POST' | 'PATCH' | 'PUT', corpo: unknown) =>
  requisitar<T>(caminho, { method: metodo, body: JSON.stringify(corpo) })

export const api = {
  login: (login: string, senha: string, org?: string) =>
    requisitar<Sessao>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, senha, org: org ?? null }),
    }),

  /** Criar a PRÓPRIA conta, dentro de uma organização que aceita (05/08/2026).
   *
   *  `org` é obrigatório, ao contrário do login: lá o e-mail já existe em algum
   *  tenant e a senha desempata qual; aqui não existe em nenhum, e adivinhar o
   *  tenant é como se cria uma conta na organização errada. */
  cadastro: (corpo: { login: string; senha: string; nome?: string; org: string }) =>
    escrever<Sessao>('/auth/cadastro', 'POST', corpo),

  /** O que a tela de entrada precisa saber ANTES de haver sessão — hoje, se há
   *  provedor de SSO configurado e como ele se chama. É o que faz o botão do
   *  Google não ser desenhado num servidor que não tem provedor. */
  configPublica: () =>
    requisitar<T.ConfigPublica>('/auth/config'),

  /** SSO/OIDC — as duas pontas do mesmo redirecionamento.
   *
   *  `iniciar` devolve a URL do provedor; `concluir` troca o `code` que ele
   *  devolve pela sessão. O passo do meio acontece fora daqui, no navegador. */
  sso: {
    iniciar: (org?: string) =>
      requisitar<{ authorization_url: string; state: string }>(
        `/auth/oidc/login${qs({ org })}`,
      ),
    concluir: (code: string, state: string) =>
      requisitar<Sessao>(`/auth/oidc/callback${qs({ code, state })}`),
  },

  me: () => requisitar<Usuario>('/auth/me'),

  /** Encerra as sessões desta conta no SERVIDOR. Sem esta chamada, "Sair" era
   *  só apagar o `localStorage` e o refresh token seguia valendo 14 dias. */
  sair: () => requisitar<void>('/auth/sair', { method: 'POST' }),

  /** Definição de senha por link. As três rotas são PÚBLICAS: quem chega aqui
   *  não tem sessão, e é justamente por isso que precisa delas. */
  senha: {
    /** Sempre 202, exista a conta ou não — confirmar a existência de um e-mail
     *  transformaria esta rota pública em lista de usuários da plataforma. */
    esqueci: (login: string, org?: string) =>
      escrever<{ detalhe: string }>('/auth/senha/esqueci', 'POST', { login, org: org ?? null }),
    /** Confere o link sem consumi-lo: descobrir que expirou depois de digitar a
     *  senha duas vezes é o pior momento para descobrir. */
    conferir: (token: string) => requisitar<T.ConviteSenha>(`/auth/senha/${token}`),
    redefinir: (token: string, senha: string) =>
      escrever<void>('/auth/senha/redefinir', 'POST', { token, senha }),
  },

  health: () => requisitar<{ status: string; versao: string }>('/health'),

  // --------------------------------------------------------- administração
  organizacao: {
    resumo: () => requisitar<T.ResumoOrganizacao>('/organizacao'),
    atualizar: (corpo: { nome?: string; slug?: string; cadastro_aberto?: boolean }) =>
      escrever<T.Organizacao>('/organizacao', 'PATCH', corpo),
  },

  // ------------------------------------------------------------- clientes
  clientes: {
    listar: () => requisitar<T.Page<T.Cliente>>('/clientes'),
    /** Clientes com a contagem de projetos — as pastas da home, numa consulta. */
    pastas: () => requisitar<T.ClientePasta[]>('/clientes/pastas'),
    obter: (id: string) => requisitar<T.Cliente>(`/clientes/${id}`),
    criar: (corpo: { nome: string; contato?: string | null; email?: string | null }) =>
      escrever<T.Cliente>('/clientes', 'POST', corpo),
    atualizar: (id: string, corpo: Partial<T.Cliente>) =>
      escrever<T.Cliente>(`/clientes/${id}`, 'PATCH', corpo),
    remover: (id: string) => requisitar<void>(`/clientes/${id}`, { method: 'DELETE' }),
  },

  // ------------------------------------------------------------- projetos
  projetos: {
    listar: () => requisitar<T.Page<T.Projeto>>('/projetos'),
    obter: (id: string) => requisitar<T.Projeto>(`/projetos/${id}`),
    criar: (corpo: Partial<T.Projeto> & { codigo: string; nome: string }) =>
      escrever<T.Projeto>('/projetos', 'POST', corpo),
    atualizar: (id: string, corpo: Partial<T.Projeto>) =>
      escrever<T.Projeto>(`/projetos/${id}`, 'PATCH', corpo),
    /** Manda para a LIXEIRA — não apaga. O projeto é o pai de disciplina,
     *  modelo e auditoria; volta inteiro em `/lixeira`. */
    remover: (id: string) => requisitar<void>(`/projetos/${id}`, { method: 'DELETE' }),
  },

  // ------------------------------------------------------------- empresas
  empresas: {
    listar: (filtros: { papel?: string; status?: string } = {}) =>
      requisitar<T.Page<T.Empresa>>(`/empresas${qs(filtros)}`),
    obter: (id: string) => requisitar<T.EmpresaDetalhe>(`/empresas/${id}`),
    criar: (corpo: Record<string, unknown>) => escrever<T.Empresa>('/empresas', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Empresa>(`/empresas/${id}`, 'PATCH', corpo),
    criarContato: (empresaId: string, corpo: Record<string, unknown>) =>
      escrever<T.Contato>(`/empresas/${empresaId}/contatos`, 'POST', corpo),
    removerContato: (empresaId: string, contatoId: string) =>
      requisitar<void>(`/empresas/${empresaId}/contatos/${contatoId}`, { method: 'DELETE' }),
    enviarLogo: (empresaId: string, arquivo: File) => {
      const form = new FormData()
      form.append('arquivo', arquivo)
      // Sem Content-Type: o browser precisa gerar o boundary do multipart.
      return requisitar<T.Empresa>(`/empresas/${empresaId}/logo`, {
        method: 'POST',
        body: form,
      })
    },
  },

  // ------------------------------------------------------------- usuários
  usuarios: {
    listar: () => requisitar<T.Page<T.UsuarioCadastro>>('/usuarios'),
    criar: (corpo: Record<string, unknown>) =>
      escrever<T.UsuarioCadastro>('/usuarios', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.UsuarioCadastro>(`/usuarios/${id}`, 'PATCH', corpo),
    /** Troca SÓ as telas escondidas, preservando as permissões.
     *
     *  Rota própria porque as duas coisas dividem a coluna `permissoes` no
     *  banco: mandar a lista inteira exigiria receber as permissões antes, e
     *  quem chama isto da gaveta de MEMBRO só tem `ver_painel`. Aqui vai só a
     *  lista de telas; a fusão acontece no servidor. */
    definirPaginas: (id: string, paginas: string[]) =>
      escrever<T.UsuarioCadastro>(`/usuarios/${id}/paginas`, 'PUT', { paginas }),
    definirSenha: (id: string, senha: string) =>
      escrever<void>(`/usuarios/${id}/senha`, 'PUT', { senha }),
    /** Gera o link de definição de senha — o caminho recomendado para dar
     *  acesso a alguém. Digitar a senha de outra pessoa faz quem administra
     *  saber a senha dela; isto não. O token volta UMA vez. */
    gerarConvite: (id: string) =>
      escrever<T.ConviteCriado>(`/usuarios/${id}/convite`, 'POST', {}),
    permissoes: () => requisitar<T.Permissao[]>('/usuarios/permissoes'),
  },

  // ------------------------------------------------------------ standards
  standards: {
    /** `tipo` filtra na API, não no cliente: as diretrizes do PEB e os padrões
     *  de nomenclatura moram na mesma tabela, e trazer tudo para descartar
     *  metade cresceria com o projeto. */
    listar: (projetoId: string, tipo?: string) =>
      requisitar<T.Page<T.Standard>>(`/standards${qs({ projeto_id: projetoId, tipo })}`),
    criar: (corpo: Record<string, unknown>) => escrever<T.Standard>('/standards', 'POST', corpo),
    remover: (id: string) => requisitar<void>(`/standards/${id}`, { method: 'DELETE' }),
    enviarImagem: (id: string, arquivo: File) => {
      const form = new FormData()
      form.append('arquivo', arquivo)
      return requisitar<T.Standard>(`/standards/${id}/imagem`, { method: 'POST', body: form })
    },
    /** URL ASSINADA e temporária — o bucket nunca é público. */
    imagemUrl: (id: string) =>
      requisitar<{ url: string | null }>(`/standards/${id}/imagem-url`),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Standard>(`/standards/${id}`, 'PATCH', corpo),
  },

  nomenclatura: {
    obter: (projetoId: string) =>
      requisitar<T.Nomenclatura>(`/projetos/${projetoId}/nomenclatura`),
    definir: (projetoId: string, segmentos: T.Segmento[]) =>
      escrever<T.Nomenclatura>(`/projetos/${projetoId}/nomenclatura`, 'PUT', { segmentos }),
  },

  // ----------------------------------------------------------- disciplinas
  disciplinas: {
    listar: (projetoId: string) =>
      requisitar<T.Page<T.Disciplina>>(`/disciplinas${qs({ projeto_id: projetoId })}`),
    criar: (corpo: Record<string, unknown>) =>
      escrever<T.Disciplina>('/disciplinas', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Disciplina>(`/disciplinas/${id}`, 'PATCH', corpo),
  },

  // ------------------------------------------------------------ critérios
  criterios: {
    listar: (projetoId: string, filtros: { categoria?: string; nivel?: string } = {}) =>
      requisitar<T.Page<T.CriterioComUso>>(
        `/criterios${qs({ projeto_id: projetoId, limite: 200, ...filtros })}`,
      ),
    criar: (corpo: Record<string, unknown>) => escrever<T.Criterio>('/criterios', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Criterio>(`/criterios/${id}`, 'PATCH', corpo),
    remover: (id: string) => requisitar<void>(`/criterios/${id}`, { method: 'DELETE' }),
  },

  /** O gabarito DE FÁBRICA, sem projeto e sem tocar no banco.
   *
   *  É a ESTRUTURA da auditoria — padrão da empresa, igual em todo projeto — e é
   *  o que a grade do recorte desenha. Não confundir com
   *  `checklists.aplicarGabarito`, que SEMEIA esta estrutura como critérios do
   *  projeto para que ele possa editá-la. */
  gabaritos: {
    obter: (tipo: T.ChecklistTipo, disciplina?: string) =>
      requisitar<T.LinhaGabarito[]>(`/gabaritos/${tipo}${qs({ disciplina })}`),
  },

  checklists: {
    obter: (tipo: T.ChecklistTipo, projetoId: string) =>
      requisitar<T.Checklist>(`/checklists/${tipo}${qs({ projeto_id: projetoId })}`),
    definirItens: (tipo: T.ChecklistTipo, projetoId: string, criterioIds: string[]) =>
      escrever<T.Checklist>(`/checklists/${tipo}/itens`, 'PUT', {
        projeto_id: projetoId,
        itens: criterioIds.map((criterio_id) => ({ criterio_id })),
      }),
    /** Semeia os itens de fábrica. ACRESCENTA — nunca substitui o que o projeto
     *  já ajustou; por isso é POST e não o PUT de cima.
     *
     *  `disciplina` é obrigatória nos gabaritos de LOD e ignorada na geral: os
     *  17 da geral são os mesmos nas oito disciplinas, os de LOD não. */
    aplicarGabarito: (tipo: T.ChecklistTipo, projetoId: string, disciplina?: string) =>
      escrever<T.GabaritoAplicado>(`/checklists/${tipo}/gabarito`, 'POST', {
        projeto_id: projetoId,
        ...(disciplina ? { disciplina } : {}),
      }),
  },

  // ---------------------------------------------------- fase 2 · modelos
  modelos: {
    listar: (projetoId: string) =>
      requisitar<T.Page<T.Modelo>>(`/modelos${qs({ projeto_id: projetoId, limite: 200 })}`),
    obter: (id: string) => requisitar<T.ModeloDetalhe>(`/modelos/${id}`),
    criar: (corpo: Record<string, unknown>) => escrever<T.Modelo>('/modelos', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Modelo>(`/modelos/${id}`, 'PATCH', corpo),
    versoes: (id: string) => requisitar<T.Versao[]>(`/modelos/${id}/versoes`),
    criarVersao: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Versao>(`/modelos/${id}/versoes`, 'POST', corpo),
    relatorioPdf: (id: string, idioma: 'pt' | 'en') =>
      `${BASE}/modelos/${id}/relatorio.pdf?idioma=${idioma}`,
  },

  versoes: {
    enviarArquivo: (versaoId: string, arquivo: File) => {
      const form = new FormData()
      form.append('arquivo', arquivo)
      return requisitar<T.Versao>(`/versoes/${versaoId}/upload`, { method: 'POST', body: form })
    },
    download: (versaoId: string) => requisitar<{ url: string }>(`/versoes/${versaoId}/download`),
    auditorias: (versaoId: string) => requisitar<T.Auditoria[]>(`/versoes/${versaoId}/auditorias`),
    auditar: (versaoId: string, corpo: { checklist?: string; area?: string } = {}) =>
      escrever<T.Auditoria[]>(`/versoes/${versaoId}/auditar`, 'POST', corpo),
  },

  // -------------------------------------------------- fase 2 · auditoria
  auditorias: {
    obter: (id: string) => requisitar<T.AuditoriaDetalhe>(`/auditorias/${id}`),
    /** Todas as auditorias do projeto, com o modelo resolvido. É o que o painel
     *  da tela de auditoria agrupa por tipo. Sem filtro nem paginação: são
     *  dezenas de linhas e filtrar no navegador é instantâneo — a mesma razão
     *  pela qual a busca global não tem endpoint próprio. */
    doProjeto: (projetoId: string) =>
      requisitar<T.AuditoriaDaLista[]>(`/projetos/${projetoId}/auditorias`),
    /** ABRE PELO MODELO, não pela versão: o servidor resolve a última. A gaveta
     *  escolhe um modelo, que é como a coordenação pensa, e a auditoria pertence
     *  a uma versão, que é o que muda entre rounds.
     *  É IDEMPOTENTE no round e NÃO no plano: se a auditoria já existia, ela
     *  volta replanejada com o que veio aqui — ver `_aplicar_plano` no backend. */
    abrirNoModelo: (modeloId: string, corpo: T.PlanoAuditoria & { checklist: string }) =>
      escrever<T.Auditoria[]>(`/modelos/${modeloId}/auditar`, 'POST', corpo),
    /** Replaneja. Campo ausente é "não mexa"; `null` explícito apaga. Recusa 409
     *  em round publicado — o PDF emitido nomeia responsável e data. */
    replanejar: (id: string, corpo: T.PlanoAuditoria) =>
      escrever<T.Auditoria>(`/auditorias/${id}`, 'PATCH', corpo),
    publicar: (id: string) => escrever<T.Auditoria>(`/auditorias/${id}/publicar`, 'POST', {}),
    ncs: (id: string) => requisitar<T.NaoConformidade[]>(`/auditorias/${id}/ncs`),
    criarNc: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.NaoConformidade>(`/auditorias/${id}/ncs`, 'POST', corpo),
  },

  resultados: {
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Resultado>(`/resultados/${id}`, 'PATCH', corpo),
    enviarEvidencia: (id: string, arquivo: File, legenda?: string) => {
      const form = new FormData()
      form.append('arquivo', arquivo)
      return requisitar<T.Evidencia>(
        `/resultados/${id}/evidencias${qs({ legenda })}`,
        { method: 'POST', body: form },
      )
    },
  },

  evidencias: {
    url: (id: string) => requisitar<{ url: string }>(`/evidencias/${id}/url`),
    remover: (id: string) => requisitar<void>(`/evidencias/${id}`, { method: 'DELETE' }),
  },

  ncs: {
    doProjeto: (projetoId: string, filtroStatus?: string) =>
      requisitar<T.NaoConformidade[]>(`/projetos/${projetoId}/ncs${qs({ status: filtroStatus })}`),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.NaoConformidade>(`/ncs/${id}`, 'PATCH', corpo),
    comentar: (id: string, texto: string) =>
      escrever<T.Comentario>(`/ncs/${id}/comentarios`, 'POST', { texto }),
  },

  // ----------------------------------------------- fase 2 · views/exports
  painel: (projetoId: string, checklist?: string) =>
    requisitar<T.Painel>(`/projetos/${projetoId}/painel${qs({ checklist })}`),

  matriz: (projetoId: string, checklist: T.ChecklistTipo) =>
    requisitar<T.Matriz>(`/projetos/${projetoId}/matriz${qs({ checklist })}`),

  controleXlsx: (projetoId: string) => `${BASE}/projetos/${projetoId}/controle.xlsx`,

  integracaoAcc: () => requisitar<T.StatusIntegracao>('/ingest/acc/status'),

  // ------------------------------------------------- fase 3 · automação
  nomenclaturaValidar: (corpo: {
    nome: string
    projeto_id: string
    empresa_id?: string | null
    registrar?: boolean
  }) => escrever<T.VeredictoNome>('/nomenclatura/validar', 'POST', corpo),

  nomeDoModelo: (modeloId: string) =>
    requisitar<T.VeredictoNome>(`/modelos/${modeloId}/nome-conforme`),

  penalidades: (empresaId: string) =>
    requisitar<T.Penalidade[]>(`/empresas/${empresaId}/penalidades`),

  notificacoes: (apenasNaoLidas = false) =>
    requisitar<T.Notificacao[]>(`/notificacoes${qs({ apenas_nao_lidas: apenasNaoLidas ? 1 : '' })}`),

  // ---------------------------------------------- fase 4 · colaboração
  kpis: (projetoId: string) => requisitar<T.KPIs>(`/projetos/${projetoId}/kpis`),

  scorecard: (projetoId: string) => requisitar<T.Placar>(`/projetos/${projetoId}/scorecard`),

  notif: {
    listar: (filtros: { apenas_nao_lidas?: boolean; tipo?: string } = {}) =>
      requisitar<T.Notificacao[]>(
        `/notificacoes${qs({
          apenas_nao_lidas: filtros.apenas_nao_lidas ? 'true' : '',
          tipo: filtros.tipo,
        })}`,
      ),
    contador: () => requisitar<T.ContadorNotificacoes>('/notificacoes/contador'),
    marcarLida: (id: string) => escrever<T.Notificacao>(`/notificacoes/${id}/lida`, 'POST', {}),
    marcarTodas: () =>
      requisitar<void>('/notificacoes/marcar-todas-lidas', { method: 'POST' }),
  },

  apontamentos: {
    /** `projetoId` NULO lista os de todos os projetos — é a central da Home.
     *  O backend sempre tratou `projeto_id` como filtro opcional; era a
     *  interface que insistia em passá-lo. */
    listar: (
      projetoId: string | null,
      filtros: { status?: string; prioridade?: string } = {},
    ) =>
      requisitar<T.Page<T.Apontamento>>(
        `/apontamentos${qs({ projeto_id: projetoId ?? '', limite: 200, ...filtros })}`,
      ),
    criar: (corpo: Record<string, unknown>) =>
      escrever<T.Apontamento>('/apontamentos', 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Apontamento>(`/apontamentos/${id}`, 'PATCH', corpo),
    remover: (id: string) => requisitar<void>(`/apontamentos/${id}`, { method: 'DELETE' }),
    sincronizar: (id: string) =>
      escrever<{ sincronizado: boolean; acc_issue_id: string | null; detalhe: string }>(
        `/apontamentos/${id}/sync-acc`,
        'POST',
        {},
      ),
  },

  /** Membros de um projeto (migration 0004). Registra participação e papel
   *  combinado — NÃO autoriza: quem decide continua sendo a permissão de
   *  organização do token. */
  membros: {
    /** TODOS os vínculos da organização, de todos os projetos. Uma pessoa em dois
     *  projetos são duas linhas — papel e equipe são por projeto. */
    todos: () => requisitar<T.Membro[]>('/membros'),
    listar: (projetoId: string) => requisitar<T.Membro[]>(`/projetos/${projetoId}/membros`),
    adicionar: (projetoId: string, corpo: Record<string, unknown>) =>
      escrever<T.Membro>(`/projetos/${projetoId}/membros`, 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Membro>(`/membros/${id}`, 'PATCH', corpo),
    remover: (id: string) => requisitar<void>(`/membros/${id}`, { method: 'DELETE' }),
  },

  convites: {
    listar: (projetoId: string) =>
      requisitar<T.Convite[]>(`/projetos/${projetoId}/convites`),
    criar: (projetoId: string, corpo: Record<string, unknown>) =>
      escrever<T.Convite>(`/projetos/${projetoId}/convites`, 'POST', corpo),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.Convite>(`/convites/${id}`, 'PATCH', corpo),
    revogar: (id: string) => escrever<T.Convite>(`/convites/${id}/revogar`, 'POST', {}),
  },

  /** Portal do cliente: rota pública, sem Bearer. */
  portal: (token: string) => requisitar<Record<string, unknown>>(`/portal/${token}`),

  /** Trilha de auditoria. `cursor` vem do `proximo_cursor` da página anterior:
   *  o log cresce por inserção contínua, e com offset uma linha nova entre
   *  duas páginas faria um registro aparecer duas vezes ou sumir. */
  /** Reporte de erro do sistema. ESCREVER é de qualquer pessoa autenticada —
   *  quem não consegue usar uma tela é justamente quem precisa avisar. LER é só
   *  de quem administra: o print mostra dado de projeto. */
  reportes: {
    listar: (status?: string) =>
      requisitar<T.Page<T.ReporteErro>>(`/reportes${qs({ status, limite: 200 })}`),
    criar: (corpo: Record<string, unknown>) =>
      escrever<T.ReporteErro>('/reportes', 'POST', corpo),
    enviarPrint: (id: string, arquivo: File) => {
      const form = new FormData()
      form.append('arquivo', arquivo)
      return requisitar<T.ReporteErro>(`/reportes/${id}/print`, { method: 'POST', body: form })
    },
    printUrl: (id: string) => requisitar<{ url: string | null }>(`/reportes/${id}/print-url`),
    atualizar: (id: string, corpo: Record<string, unknown>) =>
      escrever<T.ReporteErro>(`/reportes/${id}`, 'PATCH', corpo),
    remover: (id: string) => requisitar<void>(`/reportes/${id}`, { method: 'DELETE' }),
  },

  /** A lixeira. É a ÚNICA rota que enxerga o que foi removido: a policy de RLS
   *  esconde essas linhas de todas as outras, e nenhuma consulta filtra à mão. */
  lixeira: {
    listar: (tipo?: string) => requisitar<T.ItemLixeira[]>(`/lixeira${qs({ tipo })}`),
    restaurar: (tipo: string, id: string) =>
      requisitar<void>(`/lixeira/${tipo}/${id}/restaurar`, { method: 'POST' }),
    /** Definitivo — o `DELETE` de verdade. Só alcança o que já está na lixeira. */
    apagarDeVez: (tipo: string, id: string) =>
      requisitar<void>(`/lixeira/${tipo}/${id}`, { method: 'DELETE' }),
  },

  trilha: (
    filtros: {
      entidade?: string
      entidade_id?: string
      usuario_id?: string
      acao?: string
      cursor?: string
      limite?: number
    } = {},
  ) => requisitar<T.Page<T.LinhaTrilha>>(`/trilha${qs({ limite: 100, ...filtros })}`),

  automacao: {
    verificadores: () => requisitar<string[]>('/automacao/verificadores'),
    rodarAgora: (versaoId: string) =>
      escrever<T.Execucao>(`/versoes/${versaoId}/auditar-automatico`, 'POST', {}),
    enfileirar: (versaoId: string) =>
      escrever<{ enfileirado: boolean; task_id: string | null; detalhe: string }>(
        `/versoes/${versaoId}/enfileirar`,
        'POST',
        {},
      ),
  },

  /** IMPORTAÇÃO DE PLANILHA — ponte provisória, ver a migration 0012.
   *  Não passa pelo caminho de auditoria: lê os .xlsx que a coordenação já
   *  preenche à mão e alimenta um dashboard próprio. */
  importacao: {
    // TODOS OS ARQUIVOS NUM POST SÓ, sob o mesmo campo `arquivos`. Um POST por
    // arquivo daria N respostas parciais para a tela costurar, e a substituição
    // do "reimportar troca o anterior" passaria a depender da ordem de chegada.
    // A QUERY VAI POR `qs()`, sempre — não montada à mão no template. Fora a
    // codificação, é o que o `test_contrato` consegue ler: ele extrai os
    // caminhos deste arquivo e confere um a um contra o OpenAPI, e sabe
    // descartar `${qs(...)}`. Um `?projeto_id=${id}` escrito à mão vira um
    // caminho inexistente aos olhos dele e quebra a trava. Foi o que aconteceu.
    enviar: (arquivos: File[], projetoId?: string) => {
      const form = new FormData()
      for (const a of arquivos) form.append('arquivos', a)
      // Sem Content-Type: o browser precisa gerar o boundary do multipart.
      return requisitar<T.ResultadoImportacao>(
        `/importacao/planilhas${qs({ projeto_id: projetoId })}`,
        { method: 'POST', body: form },
      )
    },
    dashboard: (projetoId?: string) =>
      requisitar<T.DashboardImportacao>(
        `/importacao/dashboard${qs({ projeto_id: projetoId })}`,
      ),
    remover: (id: string) =>
      requisitar<void>(`/importacao/planilhas/${id}`, { method: 'DELETE' }),
  },

  /** Baixa um arquivo autenticado: o Bearer não vai numa tag <a>. */
  baixarArquivo: async (url: string, nomeSugerido: string) => {
    const tokens = lerTokens()
    const resp = await fetch(url, {
      headers: tokens ? { Authorization: `Bearer ${tokens.access_token}` } : undefined,
    })
    if (!resp.ok) throw new ApiError(resp.status, await extrairErro(resp))
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = nomeSugerido
    a.click()
    URL.revokeObjectURL(objectUrl)
  },
}
