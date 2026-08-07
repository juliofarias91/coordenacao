/** Convidar alguém para o projeto — a gaveta (07/08/2026).
 *
 *  Portada do formulário de `Projeto.jsx:3577-3686` da VDCity, que lá é modal E
 *  drawer com a mesma lógica duplicada. Aqui é gaveta e só: a régua da seção
 *  "Sistema visual" diz que formulário pontual disparado de uma tela de trabalho
 *  entra na gaveta, e ela já é a superfície de todo formulário deste projeto.
 *
 *  ═══ OS DOIS BOTÕES SÃO OS DOIS FLUXOS, e é a estrutura da origem
 *
 *  - **Convidar por e-mail** — trava o convite num endereço. Uso único.
 *  - **Copiar link** — link aberto, que qualquer pessoa logada pode usar até
 *    vencer. É o caso de mandar um no grupo da disciplina.
 *
 *  O que decide qual é o CAMPO DE E-MAIL estar preenchido, exatamente como no
 *  servidor. Por isso os dois botões convivem sem um seletor de modo: a pessoa
 *  digita, ou não digita, e escolhe o botão.
 *
 *  ═══ O QUE NÃO VEIO DO FORMULÁRIO DE ORIGEM
 *
 *  - **Empresa.** Lá o campo acha-ou-cria uma `company` pelo nome digitado. Aqui
 *    `empresa` é o fornecedor AUDITADO (projetista, instaladora), e um convite
 *    que criasse empresa produziria projetista por engano.
 *  - **Páginas visíveis.** Lá é por membro e por projeto; aqui as telas ocultas
 *    moram em `usuario.permissoes` e valem na organização INTEIRA — quem
 *    coordena um projeto estaria mudando o que alguém enxerga em todos os
 *    outros. Fora do convite inteiro, a pedido (07/08/2026).
 *
 *  ═══ OS DOIS PRAZOS QUE APARECEM NA TELA SÃO DIFERENTES
 *
 *  O campo de data é o prazo do ACESSO — até quando a pessoa fica no projeto. O
 *  link vale 3 dias e isso não se escolhe: é segurança, não combinado. A tela diz
 *  os dois porque confundi-los é o erro que a especificação de origem chama de
 *  "a parte mais fácil de errar".
 */
import { useState } from 'react'

import Gaveta from '@/components/Gaveta'
import { PAPEIS_PROJETO } from '@/components/TabelaMembros'
import { Campo, Erro } from '@/components/ui'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/lib/api'

export default function ConvidarPessoa({
  projetoId,
  projetoNome,
  aberta,
  onFechar,
  onConvidou,
}: {
  projetoId: string
  projetoNome: string
  aberta: boolean
  onFechar: () => void
  onConvidou: () => void
}) {
  const { L } = useI18n()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState('leitor')
  const [equipe, setEquipe] = useState('')
  const [ate, setAte] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  /** O corpo dos dois fluxos. `email` só entra quando há — é ele que decide se o
   *  convite trava num endereço, e mandá-lo vazio criaria um convite travado no
   *  endereço "". */
  function corpo(comEmail: boolean) {
    return {
      papel,
      email: comEmail ? email.trim().toLowerCase() : null,
      equipe: equipe.trim() || null,
      // 23:59:59 do dia escolhido, como na origem: um `<input type=date>` dá
      // meia-noite, e "acesso até dia 20" que morre no começo do dia 20 tira um
      // dia inteiro de quem leu a data.
      acesso_expira_em: ate ? new Date(`${ate}T23:59:59`).toISOString() : null,
    }
  }

  async function criar(comEmail: boolean) {
    setErro(null)
    setAviso(null)
    setLink(null)
    if (comEmail && !email.trim()) {
      setErro(L('Digite o e-mail de quem você quer convidar.', 'Type the e-mail to invite.'))
      return
    }
    setEnviando(true)
    try {
      const r = await api.convitesDeEquipe.criar(projetoId, corpo(comEmail))
      const url = `${window.location.origin}${r.caminho}`
      setLink(url)
      onConvidou()

      if (!comEmail) {
        // LINK ABERTO: copiar é a entrega. `clipboard` falha fora de HTTPS —
        // então o link fica na tela de qualquer jeito, selecionável, que é a
        // mesma degradação que a origem faz com um prompt.
        await navigator.clipboard.writeText(url).catch(() => undefined)
        setAviso(L('Link copiado. Vale 3 dias.', 'Link copied. Valid for 3 days.'))
        return
      }

      // ⚠ O E-MAIL SAI DO SERVIDOR desde 07/08/2026 — a tela só relata. Antes
      // ela mesma chamava o EmailJS, e isso significava a chave pública no
      // bundle e duas configurações de e-mail para manter.
      //
      // O convite NUNCA depende do envio: o link já está na tela, e
      // `email_enviado: false` vira instrução ("copie e mande"), não erro.
      setAviso(
        r.email_enviado
          ? L('Convite enviado por e-mail.', 'Invitation e-mailed.')
          : L(
              'Convite criado, mas o e-mail não saiu — copie o link abaixo e mande você mesmo.',
              'Invitation created, but the e-mail did not go out — copy the link below and send it yourself.',
            ),
      )
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Gaveta
      aberta={aberta}
      titulo={L('Convidar para o projeto', 'Invite to the project')}
      sub={projetoNome}
      onFechar={onFechar}
      acoes={
        <button className="btn pri block" onClick={() => criar(true)} disabled={enviando}>
          {enviando ? L('Convidando…', 'Inviting…') : L('Convidar por e-mail', 'Invite by e-mail')}
        </button>
      }
    >
      <Erro mensagem={erro} />
      {aviso && (
        <div className="pill ok" style={{ display: 'block', lineHeight: 1.5, marginBottom: 12 }}>
          {aviso}
        </div>
      )}

      <Campo rotulo={L('E-mail', 'E-mail')}>
        <input
          className="f"
          type="email"
          placeholder="pessoa@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="hint">
          {L(
            'Com e-mail, o convite vale só para essa pessoa e uma vez só. Sem e-mail, o botão abaixo gera um link que qualquer pessoa pode usar por 3 dias.',
            'With an e-mail, the invitation works only for that person, once. Without it, the button below creates a link anyone can use for 3 days.',
          )}
        </p>
      </Campo>

      <Campo rotulo={L('Papel no projeto', 'Role in project')}>
        <select className="f" value={papel} onChange={(e) => setPapel(e.target.value)}>
          {PAPEIS_PROJETO.map((p) => (
            <option key={p.valor} value={p.valor}>
              {L(p.pt, p.en)}
            </option>
          ))}
        </select>
        {(() => {
          const p = PAPEIS_PROJETO.find((x) => x.valor === papel)
          return p ? <p className="hint">{L(...p.dica)}</p> : null
        })()}
      </Campo>

      <Campo rotulo={L('Equipe', 'Team')}>
        <input
          className="f"
          placeholder="COORDENAÇÃO, INOVAÇÃO, COMERCIAL…"
          value={equipe}
          onChange={(e) => setEquipe(e.target.value)}
        />
      </Campo>

      <Campo rotulo={L('Acesso até', 'Access until')}>
        <input className="f" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <p className="hint">
          {L(
            'Opcional. Passada esta data a pessoa deixa de ver o projeto, sem ninguém precisar removê-la. Não confundir com a validade do link, que é sempre de 3 dias.',
            'Optional. After this date the person stops seeing the project, with nobody having to remove them. Not to be confused with the link validity, which is always 3 days.',
          )}
        </p>
      </Campo>

      {/* O SEGUNDO FLUXO. `.btn-link` e não um segundo `.btn`: o rodapé já tem a
          ação principal, e dois botões preenchidos fariam a gaveta perguntar
          qual dos dois é o caminho. */}
      <button
        type="button"
        className="btn block"
        onClick={() => criar(false)}
        disabled={enviando}
        style={{ marginTop: 4 }}
      >
        {L('Copiar link de convite', 'Copy invitation link')}
      </button>

      {/* O LINK FICA NA TELA depois de criado, e é a rede de baixo de tudo: se o
          e-mail falhar, se o `clipboard` falhar, se a pessoa fechar o aviso — ele
          continua aqui para copiar à mão. É a única vez que ele existe. */}
      {link && (
        <Campo rotulo={L('Link do convite', 'Invitation link')}>
          <input className="f code" readOnly value={link} onFocus={(e) => e.target.select()} />
          <p className="hint">
            {L(
              'Ele aparece uma vez só — o servidor guarda apenas um resumo dele. Se perder, gere outro.',
              'It appears once — the server keeps only a digest of it. If you lose it, create another.',
            )}
          </p>
        </Campo>
      )}

      {/* A OUTRA METADE DA PERGUNTA "convidar quem?" (07/08/2026). Esta gaveta
          traz gente para DENTRO da plataforma, como membro. Convidar o CLIENTE —
          link de leitura, sem conta, com visibilidade campo a campo — é outra
          coisa.

          O ponteiro existe porque este botão substituiu, no rodapé da barra, o
          antigo convite de portal: quem o usava para isso precisa saber para
          onde ele foi. É a mesma gentileza que aquele painel fazia ao contrário,
          mandando para `Membros do projeto` quem procurava membro de time.

          ⚠ O DESTINO MUDOU NO MESMO DIA: era `Configuração › Cliente` e passou a
          ser o recorte `Portal do cliente` DESTA tela, quando a configuração
          virou painel. O texto acompanha — um ponteiro que aponta para onde a
          coisa não está mais é pior do que ponteiro nenhum, porque manda
          procurar. */}
      <p className="hint" style={{ marginBottom: 0 }}>
        {L(
          'Para dar ao CLIENTE um link de leitura do painel, sem conta na plataforma, use Membros do projeto › Portal do cliente.',
          'To give the CLIENT a read-only link to the panel, with no platform account, use Project members › Client portal.',
        )}
      </p>
    </Gaveta>
  )
}
