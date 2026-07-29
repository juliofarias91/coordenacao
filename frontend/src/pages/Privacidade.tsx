/** Política de privacidade — página estática, rota PÚBLICA.
 *
 *  Pública porque é preciso poder lê-la ANTES de entrar: uma política de
 *  privacidade atrás de login não cumpre o papel que a LGPD lhe dá, que é o de
 *  informar antes do tratamento. Por isso ela aparece nas duas árvores de rota
 *  de `App.tsx` — a de quem está logado e a de quem não está — e a tela de
 *  login aponta para ela.
 *
 *  O CONTEÚDO DESCREVE O QUE O CÓDIGO REALMENTE FAZ, e não um texto genérico:
 *  as categorias de dado saem do schema (usuário, modelo, versão, trilha), a
 *  retenção sai do comportamento real (`ON DELETE SET NULL`, trilha imutável),
 *  e a subcontratação sai da infraestrutura em uso (Supabase, Easypanel, APS).
 *  Quando um desses mudar, esta página muda junto — é a única forma de ela
 *  continuar verdadeira.
 *
 *  ATENÇÃO: o texto é a descrição técnica correta do sistema, não um parecer
 *  jurídico. Os campos entre colchetes precisam ser preenchidos pela SPBIM, e
 *  o todo precisa passar por revisão jurídica antes de valer como política
 *  publicada.
 */
import { Link } from 'react-router-dom'

import { useI18n } from '@/i18n'

/** Última revisão do texto. Data explícita e não `new Date()`: uma política
 *  que diz "atualizada hoje" todo dia não informa nada, e a data é justamente
 *  o que permite saber se houve mudança desde a última leitura. */
const REVISAO = '2026-07-29'

type Secao = { pt: [string, string[]]; en: [string, string[]] }

const SECOES: Secao[] = [
  {
    pt: [
      'Quem trata os dados',
      [
        'A plataforma é operada pela SPBIM, que atua como controladora dos dados das contas de usuário e como operadora dos dados que cada organização cliente carrega nela.',
        'Contato do encarregado: [preencher e-mail do DPO].',
      ],
    ],
    en: [
      'Who processes the data',
      [
        'The platform is operated by SPBIM, acting as controller for user account data and as processor for the data each client organization uploads to it.',
        'Data protection officer: [fill in DPO e-mail].',
      ],
    ],
  },
  {
    pt: [
      'Que dados a plataforma guarda',
      [
        'Conta e acesso: nome, e-mail de login, papel, permissões, idioma e a organização a que a pessoa pertence. A senha é guardada apenas como hash Argon2 — a plataforma não tem como recuperá-la, só substituí-la.',
        'Trabalho: projetos, clientes, empresas projetistas e contatos, disciplinas, critérios de auditoria, modelos BIM e suas versões, resultados de auditoria, não-conformidades e apontamentos.',
        'Arquivos: os modelos enviados (IFC/Revit) e os relatórios gerados ficam em armazenamento de objetos S3, referenciados pelo banco.',
        'Trilha de auditoria: cada criação, alteração e remoção de cadastro é registrada com autor, data e os campos afetados. É o que permite responder quem mudou o quê, e é gravada automaticamente.',
        'Registros técnicos: log de aplicação em JSON, com data, rota e resultado da requisição.',
      ],
    ],
    en: [
      'What the platform stores',
      [
        'Account and access: name, sign-in e-mail, role, permissions, language and the organization the person belongs to. Passwords are stored only as an Argon2 hash — the platform cannot recover one, only replace it.',
        'Work data: projects, clients, design companies and contacts, disciplines, audit criteria, BIM models and their versions, audit results, non-conformities and issues.',
        'Files: uploaded models (IFC/Revit) and generated reports live in S3 object storage, referenced from the database.',
        'Audit trail: every record creation, change and removal is logged with author, timestamp and the affected fields. It is what answers who changed what, and it is written automatically.',
        'Technical records: JSON application logs with timestamp, route and request outcome.',
      ],
    ],
  },
  {
    pt: [
      'Para que servem',
      [
        'Executar a auditoria contratada: comparar os modelos entregues contra os critérios do PEB, produzir relatórios e alimentar o portal do cliente.',
        'Controlar acesso: autenticar a pessoa e aplicar as permissões do papel dela.',
        'Prestar contas: a trilha de auditoria existe para que uma decisão de conformidade possa ser reconstruída depois — inclusive contra a própria SPBIM.',
        'A plataforma não usa esses dados para publicidade, não os vende e não faz perfilamento de comportamento.',
      ],
    ],
    en: [
      'What they are used for',
      [
        'Running the contracted audit: checking delivered models against BEP criteria, producing reports and feeding the client portal.',
        'Access control: authenticating the person and applying the permissions of their role.',
        'Accountability: the audit trail exists so a conformity decision can be reconstructed later — including against SPBIM itself.',
        'The platform does not use this data for advertising, does not sell it, and does not profile behaviour.',
      ],
    ],
  },
  {
    pt: [
      'Separação entre organizações',
      [
        'Cada organização é um inquilino isolado. O isolamento não depende de a aplicação lembrar de filtrar: é row-level security do próprio PostgreSQL, avaliado a cada consulta, e há testes automatizados que tentam ler dados de outra organização e verificam que não conseguem.',
        'Não existe tela nem rota de API que liste organizações — é uma ausência deliberada.',
      ],
    ],
    en: [
      'Separation between organizations',
      [
        'Each organization is an isolated tenant. Isolation does not depend on the application remembering to filter: it is PostgreSQL row-level security, evaluated on every query, and there are automated tests that try to read another organization’s data and assert that they cannot.',
        'There is no screen and no API route that lists organizations — a deliberate absence.',
      ],
    ],
  },
  {
    pt: [
      'Com quem os dados são compartilhados',
      [
        'Provedor de banco e armazenamento (Supabase): guarda o banco PostgreSQL e os arquivos enviados.',
        'Provedor de hospedagem da aplicação (Easypanel, em servidor da SPBIM): executa a API e serve a interface.',
        'Autodesk Platform Services: quando um modelo Revit é auditado, o arquivo é enviado à APS para extração de propriedades. Modelos IFC são processados na própria plataforma, sem sair dela.',
        'Autodesk Construction Cloud: quando a integração está ligada, a plataforma lê modelos e escreve apontamentos no ACC do projeto.',
        'Fora esses, os dados só chegam a quem a própria organização convida — inclusive o cliente final, por link de portal com visibilidade definida campo a campo.',
      ],
    ],
    en: [
      'Who the data is shared with',
      [
        'Database and storage provider (Supabase): holds the PostgreSQL database and uploaded files.',
        'Application hosting (Easypanel, on SPBIM’s server): runs the API and serves the interface.',
        'Autodesk Platform Services: when a Revit model is audited, the file is sent to APS for property extraction. IFC models are processed inside the platform and never leave it.',
        'Autodesk Construction Cloud: when the integration is on, the platform reads models from and writes issues to the project’s ACC.',
        'Beyond these, data only reaches people the organization itself invites — including the end client, through a portal link whose visibility is defined field by field.',
      ],
    ],
  },
  {
    pt: [
      'Por quanto tempo ficam',
      [
        'Os dados de um projeto ficam enquanto a organização mantiver o projeto na plataforma.',
        'Apagar um cadastro não apaga o histórico que dependia dele: remover um cliente, por exemplo, desvincula os projetos em vez de excluí-los. Isso é intencional — histórico de auditoria não pode desaparecer porque alguém arrumou um cadastro.',
        'A trilha de auditoria não é editável pela interface, nem pela API: só se lê.',
        'Há backup periódico do banco e do bucket de arquivos, com restauração verificada.',
      ],
    ],
    en: [
      'How long it is kept',
      [
        'Project data stays for as long as the organization keeps the project on the platform.',
        'Deleting a record does not delete the history that depended on it: removing a client, for instance, unlinks its projects instead of deleting them. This is intentional — audit history cannot vanish because someone tidied up a record.',
        'The audit trail cannot be edited through the interface or the API: it is read-only.',
        'The database and the file bucket are backed up periodically, with verified restore.',
      ],
    ],
  },
  {
    pt: [
      'Direitos de quem é titular',
      [
        'Confirmar se há tratamento, acessar os dados, corrigir dado incompleto ou desatualizado, pedir anonimização ou eliminação do que for desnecessário, e pedir portabilidade.',
        'Boa parte disso já está na própria plataforma: os dados da conta são visíveis e editáveis em Administração, e os relatórios podem ser exportados em PDF e XLSX.',
        'Para o que não estiver, escreva para [preencher e-mail de contato]. O pedido é respondido no prazo da LGPD.',
        'Uma ressalva honesta: o pedido de eliminação esbarra no registro de auditoria, que a SPBIM precisa manter para provar como uma conformidade foi decidida. Nesse caso o dado é despersonalizado, não apagado, e a razão é informada.',
      ],
    ],
    en: [
      'Data subject rights',
      [
        'Confirming whether processing occurs, accessing the data, correcting incomplete or outdated data, requesting anonymization or deletion of what is unnecessary, and requesting portability.',
        'Much of this already lives in the platform: account data is visible and editable under Administration, and reports export to PDF and XLSX.',
        'For anything else, write to [fill in contact e-mail]. Requests are answered within the statutory deadline.',
        'One honest caveat: a deletion request runs into the audit record, which SPBIM must keep in order to show how a conformity decision was reached. In that case the data is de-personalized rather than erased, and the reason is stated.',
      ],
    ],
  },
  {
    pt: [
      'Cookies e rastreamento',
      [
        'A plataforma não usa cookies de publicidade nem analytics de terceiros.',
        'O que fica guardado no navegador é o necessário para funcionar e para lembrar preferências: o token da sessão, o tema claro/escuro, o idioma, o último projeto aberto e a ordem escolhida para os grupos do menu. Nada disso é enviado a terceiros.',
      ],
    ],
    en: [
      'Cookies and tracking',
      [
        'The platform uses no advertising cookies and no third-party analytics.',
        'What is stored in the browser is what is needed to work and to remember preferences: the session token, light/dark theme, language, the last opened project, and the chosen order of the menu groups. None of it is sent to third parties.',
      ],
    ],
  },
  {
    pt: [
      'Mudanças nesta política',
      [
        'Quando a política mudar, a data de revisão no topo muda junto. Mudança que altere a finalidade do tratamento é avisada às organizações clientes antes de valer.',
      ],
    ],
    en: [
      'Changes to this policy',
      [
        'When the policy changes, the revision date at the top changes with it. A change that alters the purpose of processing is announced to client organizations before it takes effect.',
      ],
    ],
  },
]

export default function Privacidade() {
  const { lang, L } = useI18n()

  return (
    <div className="doc">
      <h1>{L('Política de privacidade', 'Privacy policy')}</h1>
      <p className="sub">
        {L('Última revisão: ', 'Last revised: ')}
        {new Date(REVISAO).toLocaleDateString()}
      </p>

      {SECOES.map((secao) => {
        const [titulo, paragrafos] = lang === 'pt' ? secao.pt : secao.en
        return (
          <section key={titulo}>
            <h2>{titulo}</h2>
            {paragrafos.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        )
      })}

      <p className="hint">
        <Link to="/">{L('Voltar', 'Back')}</Link>
      </p>
    </div>
  )
}
