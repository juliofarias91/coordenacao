/** Convidar para o projeto — o botão do rodapé da sidebar de projeto.
 *
 *  ═══ ELE MUDOU DE ASSUNTO EM 07/08/2026, a pedido
 *
 *  Até aqui este botão convidava para o **PORTAL DO CLIENTE**: um link de
 *  leitura, com visibilidade campo a campo, para quem não tem conta na
 *  plataforma. E ele trazia escrito, no rodapé do próprio painel, que "convite
 *  por e-mail para quem ainda não tem conta ainda não existe" — o que deixou de
 *  ser verdade quando o convite de equipe foi portado da VDCity.
 *
 *  Agora ele abre a MESMA gaveta de `Membros do projeto` (`ConvidarPessoa`).
 *  Duas telas para o mesmo ato divergiriam na primeira mudança, e "Convidar" no
 *  rodapé da barra é o lugar em que se procura convidar gente — não convidar
 *  cliente, que é o caso raro.
 *
 *  ⚠ O CONVITE DO PORTAL NÃO SE PERDEU, e é por isso que a troca é barata: ele
 *  já tinha casa própria e MAIS COMPLETA, que lista, cria, revoga e ajusta o que
 *  o cliente enxerga. Este botão era um atalho para a metade daquilo. O `.hint`
 *  no fim da gaveta aponta para lá — a mesma gentileza que este painel fazia ao
 *  contrário, quando mandava quem procurava membro de time para
 *  `Membros do projeto`.
 *
 *  ESSA CASA MUDOU DE ENDEREÇO NO MESMO DIA: era a aba `Configuração › Cliente`
 *  e virou o recorte `Portal do cliente` de `Membros do projeto`, quando a
 *  configuração deixou de ter abas. O componente que desenha é o mesmo
 *  (`pages/configuracao/Cliente.tsx`) — mudou quem o monta.
 *
 *  ═══ QUEM VÊ O BOTÃO
 *
 *  Só quem monta a equipe: `admin_cadastro`, ou coordenar ESTE projeto. A conta
 *  é a mesma de `MembrosProjeto`, e sai da lista de membros — que é a única
 *  fonte que diz o papel de alguém NUM projeto (o token só carrega o papel de
 *  organização).
 *
 *  A LISTA É BUSCADA UMA VEZ POR PROJETO, e não a cada abertura: é uma
 *  requisição pequena, e ela precisa ter respondido ANTES do clique — um botão
 *  que aparece meio segundo depois da barra é pior do que um que não aparece.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '@/auth/AuthContext'
import ConvidarPessoa from '@/components/ConvidarPessoa'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'
import type { Projeto } from '@/lib/types'

export default function Convidar({ projeto }: { projeto: Projeto }) {
  const { L } = useI18n()
  const { usuario, pode } = useAuth()
  const [aberta, setAberta] = useState(false)
  const [coordena, setCoordena] = useState(false)

  const admin = pode('admin_cadastro')

  useEffect(() => {
    // Quem já administra o cadastro não precisa da consulta: a resposta não
    // mudaria nada, e é a maioria das contas que abrem um projeto hoje.
    if (admin || !usuario) return
    let ativo = true
    api.membros
      .listar(projeto.id)
      .then((ms) => {
        if (!ativo) return
        setCoordena(ms.some((m) => m.usuario_id === usuario.id && m.papel === 'coordenador'))
      })
      // Falhar aqui é o mesmo que não coordenar: o botão não aparece, e a pessoa
      // chega ao convite por `Membros do projeto`, que é o caminho de sempre.
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [projeto.id, usuario, admin])

  if (!(admin || coordena)) return null

  return (
    <div className="side-acao">
      <button
        type="button"
        className={`side-botao${aberta ? ' on' : ''}`}
        onClick={() => setAberta(true)}
        title={L('Convidar para o projeto', 'Invite to the project')}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
        </svg>
        <span className="nav-rot">{L('Convidar', 'Invite')}</span>
      </button>

      {/* A GAVETA, e não um `.side-painel` como antes. O painel da barra é para
          o que se lê de relance (o sino, a conta); isto é formulário, e
          formulário mora na gaveta — é a régua da seção "Sistema visual".
          Reaproveitá-la também garante que os dois lugares de convidar não
          divirjam: é o mesmo componente, com as mesmas regras.

          ⚠ VAI PARA O `body` POR PORTAL, e é obrigatório aqui — não é
          preferência. O `aside` é `position: sticky` COM `z-index`, o que faz
          dele um contexto de empilhamento: uma gaveta renderizada lá dentro
          ficaria presa no nível 50 da barra, por mais que declare 61. Hoje ela
          ainda apareceria (a topbar é 30), mas por coincidência aritmética — e
          o primeiro elemento que nascesse entre 50 e 61 passaria por cima dela
          sem que nada no CSS da gaveta explicasse por quê.

          Nos outros usos (`MembrosProjeto`, a home) a gaveta é filha do `main`,
          que não abre contexto, e por isso lá o portal não faz falta. */}
      {createPortal(
        <ConvidarPessoa
          projetoId={projeto.id}
          projetoNome={`${projeto.codigo} · ${projeto.nome}`}
          aberta={aberta}
          onFechar={() => setAberta(false)}
          onConvidou={() => undefined}
        />,
        document.body,
      )}
    </div>
  )
}
