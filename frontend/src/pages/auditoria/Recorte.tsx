/** O que cada recorte de auditoria mostra.
 *
 *  Uma tela só, parametrizada pela rota (`auditoria/:checklist`), dentro do
 *  esqueleto de `index.tsx`. O backend já servia assim desde a Fase 2 — a
 *  matriz sempre recebeu `?checklist=`.
 *
 *  DOIS RECORTES NÃO SÃO MATRIZ POR ÁREA, e a razão é estrutural, não de gosto:
 *  a matriz pergunta "como está o modelo X na área Y", e `abrir_auditoria` só
 *  grava `area` nas auditorias de especificação. Auditoria com `area = NULL` não
 *  casa com coluna nenhuma (`services/painel.py`, a busca por
 *  `(versao_id, area)`), e a tela mostrava uma grade de travessões. A geral e a
 *  LOD 300 passaram a usar o CONTROLE por modelo — que é a aba
 *  `GENERAL AUDIT - CONTROL` das planilhas — e é de lá que se abre a planilha.
 *
 *  4D, LOD 350, 400 e 500 seguem na matriz. As três primeiras têm o MESMO
 *  problema e continuam vazias; corrigi-las exige decidir entre abrir uma
 *  auditoria por área da disciplina e a matriz passar a mostrar o que não tem
 *  área — as duas mudam a contagem de rounds. Está em `docs/CONTINUACAO.md`
 *  como decisão pendente, com as saídas. Enquanto isso o estado vazio DIZ o que
 *  falta, em vez de deixar a tela parecer quebrada.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import ControleGeral from '@/components/ControleGeral'
import TabelaMatriz from '@/components/Matriz'
import { Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import { CHECKLISTS, checklistTemBanco, type Checklist } from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import type { ChecklistTipo, Matriz, Painel } from '@/lib/types'
import { useProjeto } from '@/projeto/ProjetoContext'

/** O que cada recorte responde — é a diferença entre seis telas iguais e seis
 *  telas com propósito. Sai do que os checklists significam no PEB. */
const EXPLICACAO: Record<Checklist, [string, string]> = {
  geral: [
    'Conformidade de base do modelo: nomenclatura, coordenada compartilhada, worksets, fases, organização do navegador. São 17 itens, os mesmos em toda disciplina, e todo modelo os responde.',
    'Baseline model compliance: naming, shared coordinates, worksets, phases, browser organization. 17 items, the same across every discipline, answered by every model.',
  ],
  '4d': [
    'Parâmetros de planejamento nos elementos — fase, sequência, frente de trabalho. É a auditoria que o IfcOpenShell roda sozinho sobre o IFC.',
    'Planning parameters on elements — phase, sequence, work front. This is the audit IfcOpenShell runs on its own over the IFC.',
  ],
  lod300: [
    'Geometria com dimensão, forma e posição definidas, e a informação que acompanha cada categoria de elemento. Ainda é projeto, não fabricação.',
    'Geometry with defined size, shape and location, plus the information required of each element category. Still design, not fabrication.',
  ],
  lod350: [
    'Acrescenta as interfaces entre sistemas — suportes, aberturas, o que um sistema precisa saber do outro. É o nível em que a compatibilização acontece.',
    'Adds interfaces between systems — supports, openings, what one system needs to know about another. This is where coordination happens.',
  ],
  lod400: [
    'Detalhe de fabricação e montagem. O modelo passa a valer como instrução de obra.',
    'Fabrication and assembly detail. The model becomes a construction instruction.',
  ],
  lod500: [
    'As-built verificado em campo. É o que alimenta a operação depois da entrega.',
    'Field-verified as-built. This is what feeds operations after handover.',
  ],
}

/** Os recortes que usam o CONTROLE por modelo em vez da matriz por área. É
 *  exatamente a lista dos que não têm área — ver o cabeçalho.
 *
 *  O tipo é estreito de propósito: `ControleGeral` decide para onde o botão
 *  leva a partir dele, e um recorte novo entrando aqui sem tela de planilha
 *  quebraria o build em vez de gerar um link para lugar nenhum. */
type ComControle = 'geral' | 'lod300'
const COM_CONTROLE = ['geral', 'lod300'] as const

function usaControlePorModelo(c: Checklist): c is ComControle {
  return (COM_CONTROLE as readonly string[]).includes(c)
}

function ehChecklist(v: string | undefined): v is Checklist {
  return !!v && (CHECKLISTS as readonly string[]).includes(v)
}

export default function Recorte() {
  const { L } = useI18n()
  const { projeto } = useProjeto()
  const { checklist } = useParams<{ checklist: string }>()

  const [matriz, setMatriz] = useState<Matriz | null>(null)
  const [controle, setControle] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const valido = ehChecklist(checklist)
  const temBanco = valido && checklistTemBanco(checklist)
  const usaControle = valido && usaControlePorModelo(checklist)

  const carregar = useCallback(async () => {
    if (!projeto || !valido || !temBanco) return
    setErro(null)
    setCarregando(true)
    try {
      // O `as` é seguro porque `temBanco` já excluiu os que o enum do backend
      // não conhece — é exatamente o que `CHECKLISTS_SEM_BANCO` guarda.
      const tipo = checklist as ChecklistTipo
      if (usaControle) {
        setControle(await api.painel(projeto.id, tipo))
      } else {
        setMatriz(await api.matriz(projeto.id, tipo))
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projeto, checklist, valido, temBanco, usaControle])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Recorte que não existe: a URL foi digitada à mão ou o link é de uma versão
  // que tinha outro. Dizer qual é o problema custa uma linha e evita uma tela
  // em branco sem explicação.
  if (!valido) {
    return (
      <Vazio
        titulo={L('Recorte desconhecido', 'Unknown scope')}
        texto={L(
          `"${checklist}" não é um checklist desta plataforma. Os disponíveis estão no painel à esquerda.`,
          `"${checklist}" is not a checklist on this platform. The available ones are in the panel on the left.`,
        )}
      />
    )
  }

  return (
    <>
      <p className="sub" style={{ marginTop: 0, marginBottom: 18, maxWidth: 660 }}>
        {L(...EXPLICACAO[checklist])}
      </p>

      <Erro mensagem={erro} />

      {!temBanco ? (
        <Vazio
          titulo={L('Ainda não disponível', 'Not available yet')}
          texto={L(
            `O checklist ${checklist.toUpperCase()} ainda não existe no banco.`,
            `The ${checklist.toUpperCase()} checklist does not exist in the database yet.`,
          )}
        />
      ) : carregando ? (
        <p className="hint">{L('Carregando…', 'Loading…')}</p>
      ) : usaControle ? (
        <ControleGeral
          projetoId={projeto.id}
          checklist={checklist}
          linhas={controle?.linhas ?? []}
        />
      ) : (
        <TabelaMatriz
          matriz={matriz}
          vazioTitulo={L('Nada auditado neste recorte', 'Nothing audited in this scope')}
          vazioTexto={L(
            'A matriz mostra modelo × área, e as auditorias deste recorte são abertas SEM área — por isso ela aparece vazia mesmo havendo auditoria. É uma pendência conhecida (docs/CONTINUACAO.md): decidir entre abrir uma auditoria por área da disciplina ou a matriz passar a mostrar o que não tem área.',
            'The matrix shows model × area, and this scope’s audits are opened WITHOUT an area — which is why it looks empty even when audits exist. This is a known pending decision (docs/CONTINUACAO.md): whether to open one audit per discipline area, or have the matrix also show what has no area.',
          )}
        />
      )}
    </>
  )
}
