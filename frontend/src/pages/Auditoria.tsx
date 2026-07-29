/** Auditoria por checklist — geral, 4D, LOD300, LOD350, LOD400, LOD500.
 *
 *  Uma tela só, parametrizada pela rota (`/projetos/:id/auditoria/:checklist`).
 *  O backend já servia assim desde a Fase 2: a matriz sempre recebeu
 *  `?checklist=`, e até 29/07/2026 o painel a chamava com `lod500` fixo — os
 *  outros cinco recortes existiam na API e não tinham porta na interface.
 *
 *  Viraram seis entradas de menu porque é assim que se trabalha: abre-se "a
 *  LOD400", não "a matriz, e então escolhe-se LOD400 num seletor". O seletor
 *  segue aqui mesmo assim, para trocar de recorte sem voltar ao menu.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import TabelaMatriz from '@/components/Matriz'
import { Cabecalho, Erro, Vazio } from '@/components/ui'
import { useI18n } from '@/i18n'
import {
  CHECKLISTS,
  CHECKLISTS_SEM_BANCO,
  ROTULO_CHECKLIST,
  checklistTemBanco,
  type Checklist,
} from '@/layout/nav'
import { ApiError, api } from '@/lib/api'
import type { ChecklistTipo, Matriz } from '@/lib/types'
import { rotaProjeto, useProjeto } from '@/projeto/ProjetoContext'

/** O que cada recorte responde — é a diferença entre seis abas iguais e seis
 *  telas com propósito. Sai do que os checklists significam no PEB. */
const EXPLICACAO: Record<Checklist, [string, string]> = {
  geral: [
    'Conformidade de base do modelo: nomenclatura, coordenada compartilhada, worksets, unidades. É o que se confere em toda entrega, independente do nível de detalhe.',
    'Baseline model compliance: naming, shared coordinates, worksets, units. Checked on every delivery, regardless of detail level.',
  ],
  '4d': [
    'Parâmetros de planejamento nos elementos — fase, sequência, frente de trabalho. É a auditoria que o IfcOpenShell roda sozinho sobre o IFC.',
    'Planning parameters on elements — phase, sequence, work front. This is the audit IfcOpenShell runs on its own over the IFC.',
  ],
  lod300: [
    'Geometria com dimensão, forma e posição definidas. Ainda é projeto, não fabricação.',
    'Geometry with defined size, shape and location. Still design, not fabrication.',
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

function ehChecklist(v: string | undefined): v is Checklist {
  return !!v && (CHECKLISTS as readonly string[]).includes(v)
}

export default function Auditoria() {
  const { L } = useI18n()
  const navegar = useNavigate()
  const { projeto } = useProjeto()
  const { checklist } = useParams<{ checklist: string }>()

  const [matriz, setMatriz] = useState<Matriz | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const valido = ehChecklist(checklist)
  const temBanco = valido && checklistTemBanco(checklist)

  const carregar = useCallback(async () => {
    if (!projeto || !valido || !temBanco) return
    setErro(null)
    setCarregando(true)
    try {
      // O `as` é seguro porque `temBanco` já excluiu os que o enum do backend
      // não conhece — é exatamente o que `CHECKLISTS_SEM_BANCO` guarda.
      setMatriz(await api.matriz(projeto.id, checklist as ChecklistTipo))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setCarregando(false)
    }
  }, [projeto, checklist, valido, temBanco])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (!projeto) return <p className="hint">{L('Carregando…', 'Loading…')}</p>

  // Checklist que não existe: a URL foi digitada à mão ou o link é de uma
  // versão que tinha outro recorte. Dizer qual é o problema custa uma linha e
  // evita uma tela em branco sem explicação.
  if (!valido) {
    return (
      <>
        <Cabecalho titulo={L('Auditoria', 'Audit')} />
        <Vazio
          titulo={L('Recorte desconhecido', 'Unknown scope')}
          texto={L(
            `"${checklist}" não é um checklist desta plataforma. Os disponíveis são: ${CHECKLISTS.join(', ')}.`,
            `"${checklist}" is not a checklist on this platform. Available: ${CHECKLISTS.join(', ')}.`,
          )}
        />
      </>
    )
  }

  return (
    <>
      <Cabecalho
        titulo={L(...ROTULO_CHECKLIST[checklist])}
        sub={L(...EXPLICACAO[checklist])}
      />

      {/* Trocar de recorte sem voltar ao menu. Chips e não abas: são seis, e
          seis abas numa linha só quebram antes de caber. */}
      <div className="filters">
        {CHECKLISTS.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip${c === checklist ? ' on' : ''}`}
            onClick={() => navegar(rotaProjeto(projeto.id, `auditoria/${c}`))}
          >
            {L(...ROTULO_CHECKLIST[c])}
          </button>
        ))}
      </div>

      <Erro mensagem={erro} />

      {/* Recorte no menu mas ainda sem banco: diz o que falta, em vez de
          chamar a API e devolver um 422 de validação que não explica nada. */}
      {!temBanco ? (
        <Vazio
          titulo={L('Ainda não disponível', 'Not available yet')}
          texto={L(
            `O checklist ${checklist.toUpperCase()} ainda não existe no banco — o enum de checklists tem geral, IFC, 4D, LOD400 e LOD500. Entra na migration 0004, junto com ${CHECKLISTS_SEM_BANCO.filter((c) => c !== checklist).join(' e ').toUpperCase()}.`,
            `The ${checklist.toUpperCase()} checklist does not exist in the database yet — the checklist enum has general, IFC, 4D, LOD400 and LOD500. It lands in migration 0004, together with ${CHECKLISTS_SEM_BANCO.filter((c) => c !== checklist).join(' and ').toUpperCase()}.`,
          )}
        />
      ) : carregando ? (
        <p className="hint">{L('Carregando…', 'Loading…')}</p>
      ) : (
        <TabelaMatriz
          matriz={matriz}
          vazioTitulo={L('Nada auditado neste recorte', 'Nothing audited in this scope')}
          vazioTexto={L(
            'A matriz mostra as disciplinas que declaram este checklist e as áreas do escopo delas. Se está vazia, nenhuma disciplina do projeto o declara ainda — isso se define em Configurações do projeto › Disciplinas.',
            'The matrix shows disciplines declaring this checklist and their scoped areas. If empty, no discipline in the project declares it yet — set that in Project setup › Disciplines.',
          )}
        />
      )}
    </>
  )
}
