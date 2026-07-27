/**
 * Teste do modelo de padrões contra os nomes reais da convenção ACC do usuário.
 * Rode com: node tests/naming.test.mjs   (exit 0 = tudo passou)
 *
 * Sem framework de propósito — é um smoke test determinístico que qualquer um
 * roda sem instalar nada. Cobre: nomes corretos passam, extensão dupla e códigos
 * inválidos falham no bloco certo, e a duplicidade encontra os pares problemáticos.
 */
import { accPresetPatterns, matchBestPattern, validateName, findDuplicates, findContentDuplicates, exampleFor, checkFilenameHygiene } from '../src/lib/patterns.js'

const P = accPresetPatterns()

let pass = 0
let fail = 0
const t = (cond, desc) => {
  cond ? pass++ : fail++
  if (!cond) console.log(`  FAIL ${desc}`)
}

// Nomes corretos (das telas do ACC) — todos devem casar algum padrão.
const CORRECT = [
  '4D Parameter Audit_PLMB-DIES-SITE.pdf',
  '4D Parameter Audit_PLMB-PLMB-DATA.pdf',
  '4D Parameter Audit_SCTY-DEVS-SITE.pdf',
  'Relatório de Auditoria_PLMB-PLMB-DATA.pdf',
  'Relatório de Auditoria_SCTY-DEVS-DATA.pdf',
  'Spec Audit LOD300-ADMN_PLMB-PLMB-DATA.pdf',
  'Spec Audit LOD300-COL3_PLMB-PLMB-DATA.pdf',
  'Spec Audit LOD300-SITE_PLMB-DIES-SITE.pdf',
  'Spec Audit LOD400-UTLS_SCTY-DEVS-DATA.pdf',
  'Spec Audit LOD500-COL1_SCTY-DEVS-DATA.pdf',
]
for (const name of CORRECT) {
  const r = matchBestPattern(name, P)
  t(r && r.ok, `correto deveria passar: ${name} → ${r?.ok ? 'ok' : JSON.stringify(r?.issues)}`)
}

// Extensão dupla deve ser sinalizada.
for (const name of ['Spec Audit LOD400-COL1_PLMB-PLMB-DATA.xlsx.pdf']) {
  const r = matchBestPattern(name, P)
  t(!r.ok && r.issues.some((i) => i.label === 'Extensão dupla'), `extensão dupla: ${name}`)
}

// Códigos/separadores inválidos devem falhar.
for (const [name, why] of [
  ['Spec Audit LOD900-COL1_PLMB-PLMB-DATA.pdf', 'LOD inválido'],
  ['Spec Audit LOD400-COL9_PLMB-PLMB-DATA.pdf', 'código inválido'],
  ['Spec Audit LOD400-COL1_PLMB-PLMB-XXXX.pdf', 'tipo inválido'],
  ['Spec Audit LOD400-COL1-PLMB-PLMB-DATA.pdf', 'separador _ virou -'],
]) {
  const r = matchBestPattern(name, P)
  t(!r.ok, `${why} deveria falhar: ${name}`)
}

// Duplicidade: X.pdf e X.xlsx.pdf são o mesmo documento.
const dups = findDuplicates([
  'Spec Audit LOD400-COL1_PLMB-PLMB-DATA.pdf',
  'Spec Audit LOD400-COL1_PLMB-PLMB-DATA.xlsx.pdf',
  '4D Parameter Audit_PLMB-PLMB-DATA.pdf',
])
t(dups.length === 1 && dups[0].type === 'documento', `duplicidade documento detectada (veio ${JSON.stringify(dups.map((d) => d.type))})`)

// Higiene de nome: problemas independentes de padrão.
const hy = (n) => checkFilenameHygiene(n).map((i) => i.label)
t(hy('4D Parameter Audit_PLMB-PLMB-DATA.pdf').length === 0, 'nome limpo não gera higiene')
t(hy('Relatório  de Auditoria_PLMB-PLMB-DATA.pdf').includes('Espaço duplo'), 'espaço duplo detectado')
t(hy('Relatório de Auditoria .pdf').includes('Espaço nas bordas'), 'espaço antes da extensão detectado')
t(hy('Relatório de Auditoria .pdf').includes('Espaço duplo') === false, 'espaço antes da extensão não vira espaço duplo')
t(hy('Relatorio: final.pdf').includes('Caractere inválido'), 'caractere inválido detectado')
t(hy('Relatorio..pdf').includes('Ponto sobrando'), 'ponto repetido detectado')

// Cópia por conteúdo: mesmo hash, nomes diferentes → detectado.
const cdup = findContentDuplicates([
  { name: 'Relatório_final.pdf', hash: 'aaa' },
  { name: 'Relatório_final - Cópia.pdf', hash: 'aaa' }, // cópia renomeada
  { name: 'outro.pdf', hash: 'bbb' },
])
t(cdup.length === 1 && cdup[0].files.length === 2, 'cópia por conteúdo detectada mesmo com nome diferente')
// Sem hash (crypto.subtle indisponível) → não quebra, só não detecta.
t(findContentDuplicates([{ name: 'a.pdf', hash: null }, { name: 'b.pdf', hash: null }]).length === 0, 'sem hash não gera duplicidade de conteúdo')
// Hashes diferentes (arquivos distintos) → nada.
t(findContentDuplicates([{ name: 'a.pdf', hash: '1' }, { name: 'b.pdf', hash: '2' }]).length === 0, 'conteúdos distintos não colidem')

// Os exemplos gerados por cada padrão são, eles próprios, válidos.
for (const p of P) {
  const r = validateName(exampleFor(p), p)
  t(r.ok, `exemplo de "${p.name}" deveria ser válido: ${exampleFor(p)} → ${JSON.stringify(r.issues)}`)
}

console.log(`${pass} passaram, ${fail} falharam`)
process.exit(fail ? 1 : 0)
