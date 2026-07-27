/**
 * Copia os dicionários Hunspell de node_modules para public/, de onde o worker
 * os busca via fetch em runtime.
 *
 * São dois idiomas: pt-BR (dictionary-pt) e inglês/US (dictionary-en). A auditoria
 * aceita uma palavra como correta se ela existir em QUALQUER um dos dois — as
 * planilhas do ACC misturam português e termos técnicos em inglês.
 *
 * O par .aff/.dic de cada idioma só é lido dentro do Web Worker; mantê-lo em
 * public/ (e não em src/) o deixa fora do bundle do Vite.
 */
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const to = join(root, 'public', 'dictionaries')

// pt-BR é obrigatório; o inglês é desejável mas opcional — se o pacote não estiver
// instalado, o worker degrada para só-pt em vez de quebrar a auditoria inteira.
const DICTS = [
  { pkg: 'dictionary-pt', out: 'pt_BR', required: true },
  { pkg: 'dictionary-en', out: 'en_US', required: false },
]

const exists = (p) => stat(p).then(() => true, () => false)

await mkdir(to, { recursive: true })

for (const { pkg, out, required } of DICTS) {
  const from = join(root, 'node_modules', pkg)
  if (!(await exists(from))) {
    const msg = `[copy-dict] ${pkg} não encontrado.`
    if (required) {
      console.error(`${msg} Rode \`npm install\` primeiro.`)
      process.exit(1)
    }
    console.warn(`${msg} O inglês ficará de fora — rode \`npm install\` para habilitá-lo.`)
    continue
  }

  for (const [src, dest] of [['index.aff', `${out}.aff`], ['index.dic', `${out}.dic`]]) {
    const target = join(to, dest)
    if (await exists(target)) continue
    await copyFile(join(from, src), target)
    console.log(`[copy-dict] ${dest}`)
  }
}
