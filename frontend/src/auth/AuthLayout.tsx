/** A superfície de antes de entrar — login e definir senha.
 *
 *  MODELO: a tela de login do VDCity. Fundo escuro contínuo com glows de
 *  accent, marca à esquerda, formulário à direita, campos translúcidos. O que
 *  não veio de lá:
 *
 *  - **A marca gráfica.** O tetraedro orbitando é identidade do VDCity, e o
 *    Shell daqui decidiu não ter símbolo enquanto não houver logotipo de
 *    verdade (ver `layout/Shell.tsx`). Fica o wordmark.
 *  - **O passo de MFA/TOTP.** Não existe segundo fator nesta plataforma.
 *
 *  **CADASTRO ABERTO E LOGIN SOCIAL ENTRARAM EM 05/08/2026, a pedido**, e esta
 *  lista os trazia como "o que não veio" — o acesso era só por convite do admin.
 *  A reversão não é total, e o que sobrou da regra antiga está em
 *  `services/cadastro_aberto.py`: quem se cadastra não cria organização, entra
 *  numa que já existe E que ligou o interruptor, no papel menos privilegiado.
 *
 *  Existe como componente, e não copiado nas páginas, porque as duas colunas e
 *  a marca são a mesma coisa em todas — o que muda é o formulário. Duplicar
 *  deixaria login, cadastro, definir-senha e retorno do SSO divergirem no
 *  primeiro ajuste de espaçamento.
 *
 *  É a única tela que não segue o tema: escura sempre. O porquê está na seção
 *  AUTENTICAÇÃO de `styles/app.css`, junto da paleta local.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useI18n } from '@/i18n'

export default function AuthLayout({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub: string
  children: ReactNode
}) {
  const { L } = useI18n()

  const marca = (
    <>
      <div className="auth-logo">SPBIM</div>
      <div className="auth-logo-sub">{L('Coordenação BIM', 'BIM Coordination')}</div>
    </>
  )

  return (
    <div className="auth">
      <div className="auth-marca">
        <div className="auth-marca-txt">
          {marca}
          <p className="auth-pitch">
            {L(
              'Auditoria de modelos Revit e IFC contra os critérios do PEB. A auditoria é a fonte do dado — painel, matriz e relatório saem dela.',
              'Revit and IFC model auditing against BEP criteria. The audit is the source of record — panel, matrix and report derive from it.',
            )}
          </p>
        </div>
      </div>

      <div className="auth-form">
        <div className="auth-caixa">
          {/* A marca compacta só aparece abaixo de 1024px, onde a coluna da
              esquerda não existe e a tela ficaria sem dizer de que sistema é. */}
          <div className="auth-marca-mobile">{marca}</div>

          <h1 className="auth-titulo">{titulo}</h1>
          <p className="auth-sub">{sub}</p>

          {children}

          {/* Antes de entrar, não depois: é aqui que ainda se pode decidir não
              entregar dado nenhum. */}
          <div className="auth-rodape">
            <p className="hint" style={{ margin: 0, textAlign: 'center' }}>
              <Link to="/privacidade">{L('Política de privacidade', 'Privacy policy')}</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
