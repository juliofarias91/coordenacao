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
    if (Array.isArray(corpo?.detail)) return corpo.detail.map((d: never) => String(d)).join('; ')
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

  me: () => requisitar<Usuario>('/auth/me'),

  health: () => requisitar<{ status: string; versao: string }>('/health'),

  // --------------------------------------------------------- administração
  organizacao: {
    resumo: () => requisitar<T.ResumoOrganizacao>('/organizacao'),
    atualizar: (corpo: { nome?: string; slug?: string }) =>
      escrever<T.Organizacao>('/organizacao', 'PATCH', corpo),
  },

  // ------------------------------------------------------------- projetos
  projetos: {
    listar: () => requisitar<T.Page<T.Projeto>>('/projetos'),
    obter: (id: string) => requisitar<T.Projeto>(`/projetos/${id}`),
    criar: (corpo: Partial<T.Projeto> & { codigo: string; nome: string }) =>
      escrever<T.Projeto>('/projetos', 'POST', corpo),
    atualizar: (id: string, corpo: Partial<T.Projeto>) =>
      escrever<T.Projeto>(`/projetos/${id}`, 'PATCH', corpo),
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
    definirSenha: (id: string, senha: string) =>
      escrever<void>(`/usuarios/${id}/senha`, 'PUT', { senha }),
    permissoes: () => requisitar<T.Permissao[]>('/usuarios/permissoes'),
  },

  // ------------------------------------------------------------ standards
  standards: {
    listar: (projetoId: string) =>
      requisitar<T.Page<T.Standard>>(`/standards${qs({ projeto_id: projetoId })}`),
    criar: (corpo: Record<string, unknown>) => escrever<T.Standard>('/standards', 'POST', corpo),
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

  checklists: {
    obter: (tipo: T.ChecklistTipo, projetoId: string) =>
      requisitar<T.Checklist>(`/checklists/${tipo}${qs({ projeto_id: projetoId })}`),
    definirItens: (tipo: T.ChecklistTipo, projetoId: string, criterioIds: string[]) =>
      escrever<T.Checklist>(`/checklists/${tipo}/itens`, 'PUT', {
        projeto_id: projetoId,
        itens: criterioIds.map((criterio_id) => ({ criterio_id })),
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
    listar: (projetoId: string, filtros: { status?: string; prioridade?: string } = {}) =>
      requisitar<T.Page<T.Apontamento>>(
        `/apontamentos${qs({ projeto_id: projetoId, limite: 200, ...filtros })}`,
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

  trilha: (filtros: { entidade?: string; entidade_id?: string; acao?: string } = {}) =>
    requisitar<T.Page<T.LinhaTrilha>>(`/trilha${qs({ limite: 100, ...filtros })}`),

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
