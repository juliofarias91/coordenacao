/** Escolher um cliente — ou cadastrar um na hora.
 *
 *  EXISTE PARA NÃO HAVER DOIS. O padrão nasceu no editor da Administração e
 *  passou a ser preciso também no "+ Novo projeto" da Home; duplicá-lo criaria
 *  duas telas que cadastram cliente, e elas divergem no primeiro campo novo que
 *  o cliente ganhar. Aqui ficam o seletor, o campo que ele revela e a ordem de
 *  gravação — os três pedaços que precisam concordar.
 *
 *  O SELETOR, E NÃO CAMPO LIVRE, é o que impede 'Microsoft' e 'microsoft' de
 *  virarem dois clientes — e duas pastas na Home. O cliente deixou de ser texto
 *  na migration 0003 justamente por isso.
 */
import { Campo } from '@/components/ui'
import { useI18n } from '@/i18n'
import { api } from '@/lib/api'

/** Valor do seletor que revela o campo de cliente novo. Não é um UUID, então
 *  nunca colide com um cliente de verdade. */
export const NOVO_CLIENTE = '__novo__'

/** O id a gravar no projeto, cadastrando o cliente antes se for o caso.
 *
 *  A ORDEM IMPORTA: o cliente nasce primeiro, para o projeto já apontar para
 *  ele. Se o cadastro falhar — nome repetido, por exemplo —, a exceção sobe e o
 *  projeto NÃO é criado. É melhor do que gravar o projeto sem cliente e deixar
 *  a correção para quem for descobrir depois.
 */
export async function resolverClienteId(
  escolha: string,
  nomeNovo: string,
): Promise<string | null> {
  if (escolha !== NOVO_CLIENTE) return escolha || null
  const nome = nomeNovo.trim()
  // Sem nome digitado, "novo cliente" é uma escolha incompleta, não um erro:
  // o projeto nasce sem cliente e a ficha resolve depois.
  return nome ? (await api.clientes.criar({ nome })).id : null
}

export default function SeletorCliente({
  clientes,
  valor,
  nomeNovo,
  onChange,
  onChangeNome,
  largo,
}: {
  /** `{id, nome}` basta — serve tanto a `Cliente` quanto às pastas da Home. */
  clientes: Array<{ id: string; nome: string }>
  valor: string
  nomeNovo: string
  onChange: (v: string) => void
  onChangeNome: (v: string) => void
  largo?: boolean
}) {
  const { L } = useI18n()
  return (
    <>
      <Campo rotulo={L('Cliente', 'Client')} largo={largo}>
        <select className="f" value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">{L('— sem cliente —', '— no client —')}</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
          <option value={NOVO_CLIENTE}>{L('+ novo cliente…', '+ new client…')}</option>
        </select>
      </Campo>
      {valor === NOVO_CLIENTE && (
        <Campo rotulo={L('Nome do novo cliente', 'New client name')} largo={largo}>
          <input
            className="f"
            autoFocus
            placeholder="Microsoft"
            value={nomeNovo}
            onChange={(e) => onChangeNome(e.target.value)}
          />
        </Campo>
      )}
    </>
  )
}
