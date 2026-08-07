/** O checklist da senha, ao vivo, sob o campo.
 *
 *  POR QUE ELE EXISTE: a regra era contada uma vez, num `.hint` em prosa abaixo
 *  do botão ("Pelo menos 10 caracteres…"), e conferida DEPOIS de enviar. Quem
 *  errasse a composição descobria por uma frase de erro no topo do formulário,
 *  um problema por vez. Aqui a regra é a mesma coisa que o retorno: as quatro
 *  linhas estão à vista enquanto se digita e cada uma acende sozinha.
 *
 *  DUAS COLUNAS, e não uma lista de quatro linhas: empilhadas, elas empurram o
 *  botão de criar conta para fora da primeira dobra num notebook — e o
 *  formulário de cadastro já tem cinco campos acima delas.
 *
 *  ⚠ A COR AQUI É ESTADO SEMÂNTICO, e é o que a regra 2 permite. O verde não
 *  decora: ele é a resposta à única pergunta que o bloco faz. Mas ele só entra
 *  no ITEM CUMPRIDO — o pendente fica em `--ink-3`, tinta apagada, e NÃO em
 *  vermelho. Vermelho nos quatro itens faria toda senha começar como quatro
 *  erros, e um campo vazio que ainda não foi tocado não errou nada.
 *
 *  NÃO APARECE COM O CAMPO VAZIO (`visivel`): quem ainda não digitou não tem o
 *  que conferir, e quatro linhas cinzentas sob um campo em branco leem-se como
 *  aviso, não como guia.
 */
import { useI18n } from '@/i18n'
import { regrasDaSenha } from '@/lib/senha'

function Confere({ ok }: { ok: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      {/* O visto só é desenhado quando o item está cumprido. O círculo fica nos
          dois estados: sem ele, o item pendente não teria marcador nenhum e a
          coluna perderia o alinhamento à esquerda quando um item acendesse. */}
      {ok && <path d="m8 12.3 2.6 2.6L16 9.5" />}
    </svg>
  )
}

export default function RequisitosSenha({ senha }: { senha: string }) {
  const { L } = useI18n()
  if (!senha) return null

  return (
    <ul className="auth-req">
      {regrasDaSenha(senha).map((r) => (
        <li key={r.chave} className={r.ok ? 'ok' : undefined}>
          <Confere ok={r.ok} />
          {L(...r.rotulo)}
        </li>
      ))}
    </ul>
  )
}
