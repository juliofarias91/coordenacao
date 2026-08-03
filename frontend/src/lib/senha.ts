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

/** O que está errado com esta senha, em PT e EN — pronto para `L(...)`.
 *
 *  Devolve o par de textos em vez de um código de erro porque é assim que a
 *  plataforma fala (`L('pt', 'en')`), e um enum obrigaria cada tela a repetir a
 *  tradução — que é exatamente o tipo de duplicação que este arquivo existe
 *  para acabar.
 *
 *  `repetida` é opcional: nem todo formulário tem confirmação (o do admin
 *  define a senha de outra pessoa, não a própria).
 */
export function problemaDaSenha(senha: string, repetida?: string): [string, string] | null {
  if (senha.length < MIN_SENHA) {
    return [
      `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`,
      `The password needs at least ${MIN_SENHA} characters.`,
    ]
  }
  // Confirmação no cliente: o servidor não tem como saber que houve erro de
  // digitação, e uma senha trocada por engano tranca quem a trocou.
  if (repetida !== undefined && senha !== repetida) {
    return ['As duas senhas não conferem.', 'The two passwords do not match.']
  }
  return null
}
