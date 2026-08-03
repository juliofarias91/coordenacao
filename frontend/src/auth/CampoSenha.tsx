/** Campo de senha com mostrar/ocultar, para as telas de autenticação.
 *
 *  POR QUE O OLHO EXISTE: o mínimo aqui é 10 caracteres, e digitar dez às cegas
 *  é o que faz a pessoa errar a confirmação duas vezes e acabar pedindo
 *  redefinição de uma senha que ela sabe. Expor o campo por dois segundos numa
 *  tela onde ninguém está olhando por cima do ombro custa menos do que isso.
 *
 *  O ícone é um olho convencional, e não o do VDCity (anéis concêntricos): esse
 *  é uma escolha gráfica de lá, e um olho que ninguém reconhece como olho é
 *  pior do que o genérico. O traço segue o do resto do sistema — 1.8, pontas
 *  redondas.
 */
import { useState } from 'react'

import { useI18n } from '@/i18n'

function Olho({ aberto }: { aberto: boolean }) {
  return (
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
      {aberto ? (
        <>
          {/* Riscado = "clique para ocultar", o estado em que a senha está à
              vista. O risco é o que se lê como "desligar isto". */}
          <path d="M2 2l20 20" />
          <path d="M6.7 6.75A10.8 10.8 0 0 0 1 12s4 7 11 7a10.7 10.7 0 0 0 5.3-1.4" />
          <path d="M9.9 5.2A11.5 11.5 0 0 1 12 5c7 0 11 7 11 7a20.9 20.9 0 0 1-3.2 4.2" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

export default function CampoSenha({
  id,
  rotulo,
  valor,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string
  rotulo: string
  valor: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
}) {
  const { L } = useI18n()
  const [visivel, setVisivel] = useState(false)

  return (
    <div className="auth-senha">
      {/* Fora da tela mas no DOM: `placeholder` não é nome acessível. */}
      <label className="oculto" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className="f"
        type={visivel ? 'text' : 'password'}
        placeholder={rotulo}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="auth-olho"
        /* Fora da ordem de tabulação: quem navega por teclado quer ir do campo
           ao botão de entrar, não parar num controle de conveniência visual. */
        tabIndex={-1}
        onClick={() => setVisivel(!visivel)}
        title={visivel ? L('Ocultar senha', 'Hide password') : L('Mostrar senha', 'Show password')}
        aria-label={
          visivel ? L('Ocultar senha', 'Hide password') : L('Mostrar senha', 'Show password')
        }
      >
        <Olho aberto={visivel} />
      </button>
    </div>
  )
}
