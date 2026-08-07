/** A regra de senha, num lugar só.
 *
 *  ELA ESTAVA EM TRÊS LUGARES, com valores diferentes: o backend exigia 10
 *  (`SENHA_MINIMA`, em `backend/app/schemas/usuario.py`), a tela de
 *  Configurações validava 8, e o formulário do admin não validava nada. Senha
 *  de 9 caracteres passava pela tela e voltava 422 — e o `detail` de um 422 do
 *  Pydantic é uma LISTA DE OBJETOS, que o cliente HTTP renderizava como
 *  `[object Object]`. Quem tentava trocar a senha via isso e não tinha como
 *  saber o que fazer.
 *
 *  O número está duplicado entre backend e frontend de propósito: a tela de
 *  definir senha é PÚBLICA e valida enquanto se digita, sem ter a quem
 *  perguntar. Quem impede a divergência de voltar é o
 *  `test_minimo_de_senha_igual_no_front_e_no_back`, em
 *  `backend/tests/test_autenticacao.py`, que LÊ ESTE ARQUIVO — mudar um lado
 *  sem o outro derruba a suíte.
 */

/** Espelha `SENHA_MINIMA` de `backend/app/schemas/usuario.py`. */
export const MIN_SENHA = 10

/** As regras de COMPOSIÇÃO, espelhando `validar_senha` do mesmo arquivo.
 *
 *  Entraram em 05/08/2026 junto do cadastro de conta própria: até ali a única
 *  exigência era o comprimento, e a porta de entrada deixou de ser só o convite
 *  de um admin — quem chega sozinho escolhe a senha sem ninguém por perto para
 *  dizer que `senhasenhasenha` não serve.
 *
 *  ELAS SÃO UMA LISTA, e não quatro `if`, porque a tela precisa mostrar TODAS
 *  ao mesmo tempo, cada uma com o próprio estado. Esse é o checklist que
 *  aparece sob o campo — e é ele que substitui a mensagem de erro que só
 *  aparecia depois de enviar, dizendo um problema por vez.
 *
 *  `[^\W\d_]` é "letra" com unicode: `[a-z]` recusaria uma senha cuja única
 *  letra fosse acentuada, e quem escolhe senha em português escolhe. "Especial"
 *  é o complemento — não-alfanumérico, com o `_` incluído à força porque `\w` o
 *  considera palavra.
 */
export type RegraSenha = {
  chave: 'tamanho' | 'letra' | 'numero' | 'especial'
  rotulo: [string, string]
  ok: boolean
}

export function regrasDaSenha(senha: string): RegraSenha[] {
  return [
    {
      chave: 'tamanho',
      rotulo: [`Mín. ${MIN_SENHA} caracteres`, `Min. ${MIN_SENHA} characters`],
      ok: senha.length >= MIN_SENHA,
    },
    { chave: 'letra', rotulo: ['Uma letra', 'One letter'], ok: /[^\W\d_]/u.test(senha) },
    { chave: 'numero', rotulo: ['Um número', 'One number'], ok: /\d/.test(senha) },
    {
      chave: 'especial',
      rotulo: ['Um caractere especial', 'One special character'],
      ok: /[\W_]/u.test(senha),
    },
  ]
}

/** O que está errado com esta senha, em PT e EN — pronto para `L(...)`.
 *
 *  Devolve o par de textos em vez de um código de erro porque é assim que a
 *  plataforma fala (`L('pt', 'en')`), e um enum obrigaria cada tela a repetir a
 *  tradução — que é exatamente o tipo de duplicação que este arquivo existe
 *  para acabar.
 *
 *  DIZ TUDO O QUE FALTA DE UMA VEZ, como o `validar_senha` do servidor: apontar
 *  só o primeiro problema faria quem digitou dez letras acrescentar um número e
 *  só então descobrir que falta um caractere especial.
 *
 *  `repetida` é opcional: nem todo formulário tem confirmação (o do admin
 *  define a senha de outra pessoa, não a própria).
 */
export function problemaDaSenha(senha: string, repetida?: string): [string, string] | null {
  const faltando = regrasDaSenha(senha).filter((r) => !r.ok)
  if (faltando.length) {
    return [
      `A senha precisa de: ${faltando.map((r) => r.rotulo[0].toLowerCase()).join(', ')}.`,
      `The password needs: ${faltando.map((r) => r.rotulo[1].toLowerCase()).join(', ')}.`,
    ]
  }
  // Confirmação no cliente: o servidor não tem como saber que houve erro de
  // digitação, e uma senha trocada por engano tranca quem a trocou.
  if (repetida !== undefined && senha !== repetida) {
    return ['As duas senhas não conferem.', 'The two passwords do not match.']
  }
  return null
}
