/** Envio de e-mail — O ÚNICO ponto que conhece o provedor (07/08/2026).
 *
 *  Portado de `src/services/email.js` da VDCity, e o que mais importa aqui é a
 *  forma, não o conteúdo: **nada mais no projeto sabe que existe EmailJS**. Se um
 *  dia entrar SMTP no backend, Resend ou SendGrid, troca-se este arquivo e o
 *  resto não muda — é textual na especificação de origem ("troque só este
 *  arquivo; nada mais conhece o provedor").
 *
 *  ═══ POR QUE EMAILJS, NUMA PLATAFORMA QUE NÃO TEM E-MAIL
 *
 *  O CLAUDE.md registra que "sem SMTP, a entrega é o link copiado pelo admin", e
 *  isso continua verdade para a redefinição de senha. O convite ganhou canal
 *  porque o EmailJS roda no NAVEGADOR: é a mesma infraestrutura que a VDCity já
 *  opera (mesma conta, mesmo template), e não exige servidor de e-mail nenhum
 *  deste lado.
 *
 *  ⚠ RISCO CONHECIDO, e é o preço: a chave pública vai no bundle. Quem
 *  inspecionar o front pode disparar o template para um endereço qualquer. É
 *  assim que a origem opera há tempo, e o estrago de um convite avulso é pequeno
 *  — o link só vale se o convite existir no banco, e criá-lo exige coordenar o
 *  projeto. O dia em que houver SMTP, o envio muda de lado e o risco some.
 *
 *  ═══ O E-MAIL LEVA O LINK COM TOKEN, e a ORIGEM NÃO FAZ ISSO
 *
 *  É a "armadilha 5" da especificação, decidida a pedido em 07/08/2026. Lá o
 *  e-mail é só um aviso e aponta para a home: o acesso já foi concedido, e o
 *  casamento é pelo endereço — a pessoa se cadastra e encontra o acesso lá.
 *
 *  Aqui isso não bastaria. Esta plataforma tem entrada pelo Google, e quem
 *  recebe o convite no e-mail corporativo e se cadastra com o Gmail pessoal
 *  ficaria sem vínculo nenhum e sem nada que ligasse as duas pontas. O token
 *  liga: o aceite é explícito e diz, em voz alta, quando o endereço não confere.
 */
import emailjs from '@emailjs/browser'

/** Do `.env` do Vite. Sem valor, o envio é PULADO — ver `enviarConvite`. */
export const EMAILJS = {
  service: import.meta.env.VITE_EMAILJS_SERVICE ?? '',
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? '',
  templateConvite: import.meta.env.VITE_EMAILJS_INVITE_TEMPLATE ?? '',
}

export function emailConfigurado(): boolean {
  return Boolean(EMAILJS.service && EMAILJS.publicKey && EMAILJS.templateConvite)
}

/** Envia o convite. RESOLVE em sucesso e REJEITA em erro — quem chama decide o
 *  que mostrar, porque o convite já vale com ou sem o e-mail.
 *
 *  REJEITA TAMBÉM QUANDO NÃO HÁ CONFIGURAÇÃO, em vez de resolver em silêncio:
 *  quem convidou precisa saber que ninguém recebeu nada, senão fica esperando
 *  uma resposta que nunca vai chegar. A tela transforma isso em "copie o link e
 *  mande você mesmo", que é a instrução certa.
 *
 *  As variáveis são as do template da origem (`email-templates/emailjs/
 *  invite.html`), para o mesmo template servir aos dois projetos: `to_email`,
 *  `project_name`, `link`, `company`, `cargo`, `invited_by`. */
export function enviarConvite({
  para,
  projeto,
  link,
  papel,
  convidadoPor,
}: {
  para: string
  projeto: string
  link: string
  papel: string
  convidadoPor?: string
}): Promise<unknown> {
  if (!emailConfigurado()) {
    return Promise.reject(new Error('EmailJS não configurado'))
  }
  return emailjs.send(
    EMAILJS.service,
    EMAILJS.templateConvite,
    {
      to_email: para,
      project_name: projeto,
      link,
      // O template da origem chama de `company` e imprime como quem convida — no
      // VDCity é a empresa da pessoa. Aqui é a plataforma: `empresa` neste
      // domínio é o fornecedor auditado, e escrevê-la aqui diria a coisa errada.
      company: 'SPBIM',
      cargo: papel,
      invited_by: convidadoPor || '',
    },
    EMAILJS.publicKey,
  )
}
