import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuth } from '@/auth/AuthContext'
import { useI18n } from '@/i18n'
import Shell from '@/layout/Shell'
import Admin from '@/pages/admin'
import Apontamentos from '@/pages/Apontamentos'
import Importacao from '@/pages/Importacao'
import Auditoria from '@/pages/auditoria'
import Recorte from '@/pages/auditoria/Recorte'
import BimMandate from '@/pages/BimMandate'
import Configuracao from '@/pages/configuracao'
import CfgCliente from '@/pages/configuracao/Cliente'
import CfgDisciplinas from '@/pages/configuracao/Disciplinas'
import CfgNomenclaturas from '@/pages/configuracao/Nomenclaturas'
import CfgProjetistas from '@/pages/configuracao/Projetistas'
import Configuracoes from '@/pages/Configuracoes'
import Ficha from '@/pages/Ficha'
import Criterios from '@/pages/Criterios'
import DefinirSenha from '@/pages/DefinirSenha'
import Home from '@/pages/Home'
import Integracoes from '@/pages/Integracoes'
import Kpis from '@/pages/Kpis'
import Login from '@/pages/Login'
import AdminClientes from '@/pages/admin/Clientes'
import AdminOrganizacao from '@/pages/admin/Organizacao'
import { PaginaGerenciarMembros } from '@/pages/admin/paginas'
import AdminProjetos from '@/pages/admin/Projetos'
import AdminReportes from '@/pages/admin/Reportes'
import AdminTrilha from '@/pages/admin/Trilha'
import AdminUsuarios from '@/pages/admin/Usuarios'
import KpisGerais from '@/pages/KpisGerais'
import Lixeira from '@/pages/Lixeira'
import MembrosProjeto from '@/pages/MembrosProjeto'
import ModeloView from '@/pages/Modelo'
import Notificacoes from '@/pages/Notificacoes'
import Painel from '@/pages/Painel'
import Peb from '@/pages/Peb'
import Portal from '@/pages/Portal'
import Relatorios from '@/pages/Relatorios'
import EscopoProjeto, { RotaLegada } from '@/projeto/EscopoProjeto'
import { ProjetoProvider } from '@/projeto/ProjetoContext'

/** A política entra por LAZY IMPORT, como as abas do auditer.
 *
 *  É a única tela de texto corrido da plataforma — alguns milhares de palavras
 *  em dois idiomas — e é visitada uma vez, ou nenhuma. Estaticamente, esse
 *  texto viajaria no chunk principal em toda abertura do painel. */
const Privacidade = lazy(() => import('@/pages/Privacidade'))

/** As URLs de antes de 29/07/2026, quando toda tela era global e o projeto
 *  vivia no `localStorage`. Continuam funcionando, redirecionando para o
 *  último projeto visitado — ver `RotaLegada`.
 *
 *  `apontamentos` e `integracoes` NÃO estão aqui de propósito: as duas
 *  passaram a ser globais de verdade, então a URL antiga já é a definitiva e
 *  casa com a rota real acima. Redirecioná-las para dentro de um projeto seria
 *  desfazer a mudança. */
const LEGADAS = [
  'kpis',
  'criterios',
  'relatorios',
  'configuracao',
  'peb',
  'modelos/:modeloId',
  // `painel` virou `modelos` quando a tela passou a se chamar pelo que mostra.
  // A URL antiga continua chegando à tela certa: `RotaLegada` recebe o destino
  // NOVO, e o `path` da rota é que guarda o endereço velho.
  { de: 'painel', para: 'modelos' },
]

export default function App() {
  const { usuario, carregando } = useAuth()
  const { L } = useI18n()

  if (carregando) {
    return (
      <div className="telacheia">
        <div className="hint">{L('Carregando…', 'Loading…')}</div>
      </div>
    )
  }

  const carregandoTela = <div className="hint">{L('Carregando…', 'Loading…')}</div>

  if (!usuario) {
    return (
      <Suspense fallback={carregandoTela}>
        <Routes>
          {/* O portal é público: o cliente não tem usuário na plataforma, e o
              token da URL é a credencial. Precisa vir antes do catch-all de
              login, senão o convite cai na tela de entrar. */}
          <Route path="/portal/:token" element={<Portal />} />
          {/* Definir senha é público pelo mesmo motivo, e mais um: quem chega
              aqui é justamente quem AINDA não consegue entrar. Cair no login
              seria mandá-lo para a tela que ele não tem como usar. */}
          <Route path="/definir-senha/:token" element={<DefinirSenha />} />
          {/* A política também: ela informa sobre o tratamento de dados, e uma
              política que só se lê depois de entrar chega tarde demais. */}
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    )
  }

  return (
    <ProjetoProvider>
      <Suspense fallback={carregandoTela}>
        <Routes>
          <Route path="/portal/:token" element={<Portal />} />
          <Route element={<Shell />}>
            {/* GLOBAL — vale para a organização inteira. A porta de entrada é
                a home: os projetos por cliente. Escolher o projeto é
                justamente o que ela faz; entrar direto no painel obrigava a
                adivinhar qual. */}
            <Route index element={<Home />} />
            {/* Apontamentos e Integrações vivem AQUI, não dentro de um
                projeto. Os dois já eram globais no backend — o de apontamentos
                sempre aceitou listar sem `projeto_id`, e o de integrações
                sequer tem projeto. Estavam no menu errado desde o começo. */}
            <Route path="apontamentos" element={<Apontamentos />} />
            {/* KPIs de TODOS os projetos. O `/projetos/:id/kpis` continua
                existindo e é o do projeto — este responde outra pergunta. */}
            <Route path="kpis" element={<KpisGerais />} />
            {/* PONTE PROVISÓRIA — importação das planilhas de auditoria que a
                coordenação preenche à mão. Global e não por projeto: hoje ela
                não exige vínculo com projeto, porque os arquivos reais trazem o
                código do projeto ANTERIOR no cabeçalho. Ver a migration 0012. */}
            <Route path="importacao" element={<Importacao />} />
            <Route path="integracoes" element={<Integracoes />} />

            {/* PAINEL ADMINISTRATIVO — a terceira área com sidebar própria.
                Cada aba de antes virou rota; `Admin` ficou só com a guarda de
                permissão e o `Outlet`. */}
            <Route path="admin" element={<Admin />}>
              <Route index element={<Navigate to="usuarios" replace />} />
              {/* DIRETO NAS ABAS. Cada uma destas rotas passava por um
                  invólucro em `admin/paginas.tsx` cuja única função era pôr o
                  título da página acima da aba; os títulos saíram em
                  30/07/2026 e os invólucros com eles. */}
              <Route path="usuarios" element={<AdminUsuarios />} />
              <Route path="logs" element={<AdminTrilha />} />
              <Route path="reportes" element={<AdminReportes />} />
              <Route path="organizacao" element={<AdminOrganizacao />} />
              <Route path="clientes" element={<AdminClientes />} />
              <Route path="projetos" element={<AdminProjetos />} />
            </Route>
            {/* A MESMA TELA de `/admin/usuarios`, por duas portas: aqui, no
                grupo Gestão da Home, para quem coordena; e lá, junto de
                organização, clientes e logs, para quem administra o tenant.
                Uma implementação só — o que muda é a barra lateral em volta. */}
            <Route path="membros" element={<PaginaGerenciarMembros />} />
            {/* Da CONTA, não de um projeto. `configuracoes` (plural) é a conta;
                `configuracao` (singular), dentro de um projeto, é o projeto.
                Nomes próximos, escopos distintos — o plural marca a diferença
                e a URL diz qual é qual. */}
            {/* Duas linhas, e não um `:secao?` opcional: a forma sem seção
                existe porque `/configuracoes` é o que o menu da conta aponta e
                o que já está no histórico de quem usa. Ela redireciona para a
                primeira seção dentro do componente, que é quem sabe qual é. */}
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="configuracoes/:secao" element={<Configuracoes />} />
            {/* A lixeira é global: o que foi removido pode ter vindo de
                qualquer projeto, e uma lixeira por projeto obrigaria a
                procurar em cada um. */}
            <Route path="lixeira" element={<Lixeira />} />
            {/* Notificação é do usuário e do papel dele, não de um projeto —
                por isso fica aqui e não sob `/projetos/:projetoId`. */}
            <Route path="notificacoes" element={<Notificacoes />} />
            {/* A política também entra aqui, além da árvore pública: quem já
                entrou continua com a barra e o menu ao lê-la, em vez de cair
                numa página solta sem volta. */}
            <Route path="privacidade" element={<Privacidade />} />

            {/* POR PROJETO — o projeto está na URL, não no `localStorage`. É o
                que faz `/projetos/<id>/modelos` significar a mesma coisa para
                todo mundo e virar um link que se manda a um colega. */}
            <Route path="projetos/:projetoId" element={<EscopoProjeto />}>
              {/* Sem tela, o projeto abre nos modelos — é o destino de quem
                  escolhe um projeto na home. */}
              <Route index element={<Navigate to="modelos" replace />} />
              {/* A lista e o detalhe de um modelo, aninhados como devem ser.
                  A lista chamava-se `painel`, herança do nome da planilha que
                  ela substitui; o endereço antigo redireciona logo abaixo. */}
              <Route path="modelos" element={<Painel />} />
              <Route path="modelos/:modeloId" element={<ModeloView />} />
              <Route path="painel" element={<Navigate to="../modelos" replace />} />
              <Route path="kpis" element={<Kpis />} />
              {/* A ficha cadastral — a casa dos dados do projeto. Substituiu a
                  aba `configuracao/projeto`, que editava os mesmos campos; o
                  endereço antigo redireciona logo abaixo. */}
              <Route path="ficha" element={<Ficha />} />
              {/* AUDITORIA — um item de menu por recorte, e o painel de dentro
                  da página listando disciplina › modelo. `Auditoria` é o
                  esqueleto (painel + os dois cabeçalhos alinhados) e tudo abaixo
                  é filho dele, para que o painel não seja desmontado e remontado
                  a cada navegação.

                  UMA ROTA SÓ PARA OS CINCO RECORTES, com e sem modelo
                  (01/08/2026). Antes `geral` e `lod300` tinham telas próprias e
                  os outros três não tinham nenhuma: clicar num modelo de LOD 400
                  batia numa rota inexistente e o conteúdo abria VAZIO. `Recorte`
                  é a mesma tela nos dois casos — com modelo ela é a planilha que
                  grava, sem modelo é a estrutura do recorte. */}
              <Route path="auditoria" element={<Auditoria />}>
                <Route path=":checklist/:modeloId" element={<Recorte />} />
                <Route path=":checklist" element={<Recorte />} />
                {/* Sem recorte, quem redireciona é o próprio `Auditoria` — o
                    padrão é conhecimento dele, não da tabela de rotas. */}
                <Route index element={null} />
              </Route>
              <Route path="relatorios" element={<Relatorios />} />
              {/* CONFIGURAÇÃO DO PROJETO — uma PÁGINA COM ABAS, não uma área.
                  Chegou a ter sidebar própria e voltou às abas em 29/07/2026: as
                  seis seções são o cadastro de um projeto, feito de uma vez, e
                  trocar a barra a cada seção fazia perder de vista em que
                  projeto se estava. As rotas ficaram — a aba é um `NavLink`, e é
                  por isso que o endereço continua dizendo em que seção se está. */}
              <Route path="configuracao" element={<Configuracao />}>
                <Route index element={<Navigate to="projetistas" replace />} />
                {/* A aba `projeto` virou a Ficha, na barra do projeto. O
                    endereço antigo continua chegando lá — ele está em link
                    salvo e no histórico de quem já usava a plataforma. */}
                <Route path="projeto" element={<Navigate to="../../ficha" replace />} />
                <Route path="disciplinas" element={<CfgDisciplinas />} />
                <Route path="projetistas" element={<CfgProjetistas />} />
                <Route path="nomenclaturas" element={<CfgNomenclaturas />} />
                {/* `Cores` foi absorvida por `Disciplinas` em 31/07/2026 — a
                    legenda de cor mora junto da tabela que usa as cores. A rota
                    redireciona em vez de sumir: ela está no histórico de quem já
                    usava e possivelmente em algum link colado. */}
                <Route path="cores" element={<Navigate to="../disciplinas" replace />} />
                <Route path="cliente" element={<CfgCliente />} />
              </Route>
              <Route path="criterios" element={<Criterios />} />
              {/* Quem participa DESTE projeto — outra pergunta que `/membros`,
                  que é o cadastro de contas da organização. */}
              <Route path="membros" element={<MembrosProjeto />} />
              <Route path="peb" element={<Peb />} />
              <Route path="mandate" element={<BimMandate />} />
            </Route>

            {/* Os links salvos antes da mudança. Precisam vir DEPOIS das rotas
                reais e antes do catch-all. */}
            {LEGADAS.map((entrada) => {
              const de = typeof entrada === 'string' ? entrada : entrada.de
              const para = typeof entrada === 'string' ? entrada : entrada.para
              return <Route key={de} path={de} element={<RotaLegada tela={para} />} />
            })}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ProjetoProvider>
  )
}
