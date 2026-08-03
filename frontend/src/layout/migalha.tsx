/** O ÚLTIMO PEDAÇO DO BREADCRUMB, quando quem o sabe é a página.
 *
 *  A topbar monta `cliente › projeto › tela` sozinha: os três saem do contexto
 *  de projeto e da lista de itens do menu. Só que numa planilha de auditoria a
 *  pergunta "que tela é esta?" não se responde com "Auditoria geral" — se
 *  responde com O MODELO que se está auditando, e o modelo não está em lugar
 *  nenhum que o `Shell` alcance: ele vem de `GET /modelos/{id}`, uma requisição
 *  que a página já faz.
 *
 *  ISTO EXISTE PORQUE PÁGINA NÃO TEM `h1`. Numa tela com título, o nome do
 *  modelo seria o título e acabou. Com a decisão de 30/07 — quem nomeia a tela é
 *  o breadcrumb, e só ele —, tirar o `h1` sem dar ao breadcrumb como saber o
 *  nome deixaria a planilha sendo a única tela do sistema que não diz sobre o
 *  que ela é.
 *
 *  A ALTERNATIVA ERA O SHELL BUSCAR O MODELO pelo `:modeloId` da rota. Custaria
 *  uma segunda requisição do mesmo recurso a cada navegação, e obrigaria a
 *  topbar a conhecer o formato das rotas de auditoria — que é justamente o que
 *  `rotaProjeto()` existe para concentrar.
 */
import { createContext, useContext, useEffect } from 'react'

/** O setter, e não o valor: quem lê é só a topbar, que guarda o estado. */
const MigalhaCtx = createContext<((texto: string | null) => void) | null>(null)

export const ProvedorMigalha = MigalhaCtx.Provider

/** Publica o último pedaço do caminho enquanto esta tela estiver montada.
 *
 *  LIMPA AO DESMONTAR, e é isso que impede o nome de um modelo de sobreviver à
 *  saída da planilha — sem a limpeza, ir para KPIs deixaria o código do modelo
 *  pendurado no fim do breadcrumb de uma tela que nada tem a ver com ele.
 *
 *  `null` enquanto a página carrega é o certo: melhor o breadcrumb terminar em
 *  "Auditoria geral" por um instante do que piscar um "—" que não é nome de
 *  nada. */
export function useMigalha(texto: string | null | undefined) {
  const publicar = useContext(MigalhaCtx)
  useEffect(() => {
    if (!publicar) return
    publicar(texto ?? null)
    return () => publicar(null)
  }, [publicar, texto])
}
