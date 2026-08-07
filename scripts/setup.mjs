/**
 * Prepara uma máquina para trabalhar neste repositório.
 *
 *   npm run setup
 *
 * ELE EXISTE PORQUE O README TEM DEZESSETE COMANDOS. Cada um é simples e
 * qualquer um deles, esquecido, produz um erro que não diz o que faltou —
 * `ModuleNotFoundError`, `ENOENT`, `permission denied for table`. Para quem
 * está chegando ao projeto, isso é meia manhã perdida antes da primeira linha
 * de código.
 *
 * O QUE ELE FAZ, e nada além disso:
 *   1. confere Python 3.12 e Node 20+, e PARA dizendo qual falta;
 *   2. cria `backend/.venv` e instala o backend em modo editável;
 *   3. instala o frontend (`npm install`);
 *   4. cria o `.env` a partir do `.env.example`, com um JWT_SECRET sorteado.
 *
 * O QUE ELE NÃO FAZ, de propósito:
 *
 * NÃO SOBE BANCO NEM RODA MIGRATION. Escolher onde os seus dados vão morar é
 * decisão de quem senta na máquina — Postgres local, container, ou um banco
 * gerenciado só seu —, e um script que decide isso sozinho é como se acaba
 * apontando a máquina nova para o banco do piloto. Ele imprime o próximo passo
 * e sai.
 *
 * NÃO TOCA NUM `.env` QUE JÁ EXISTA. Ele guarda senha de banco e o segredo que
 * assina as sessões; sobrescrever isso porque alguém rodou o setup duas vezes
 * derrubaria todas as sessões abertas e perderia a configuração à mão.
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BACKEND = join(RAIZ, 'backend')
const FRONTEND = join(RAIZ, 'frontend')
const WIN = process.platform === 'win32'
const VENV = join(BACKEND, '.venv')
const PY_VENV = WIN ? join(VENV, 'Scripts', 'python.exe') : join(VENV, 'bin', 'python')

const cor = (c, t) => `[${c}m${t}[0m`
const passo = (t) => console.log(`\n${cor('1;36', '▸')} ${cor('1', t)}`)
const ok = (t) => console.log(`  ${cor('32', '✓')} ${t}`)
const aviso = (t) => console.log(`  ${cor('33', '!')} ${t}`)

function morrer(t, comoResolver) {
  console.error(`\n  ${cor('31', '✗')} ${t}`)
  if (comoResolver) console.error(`\n    ${comoResolver}\n`)
  process.exit(1)
}

/** O SHELL SÓ ENTRA PARA QUEM PRECISA DELE, e isto custou uma execução falha.
 *
 *  No Windows o `npm` é um `.cmd` e não roda sem shell; mas o python da venv é
 *  um caminho ABSOLUTO — e o deste repositório tem espaço no meio
 *  (`K:\SPBIM TECH\…`). Com `shell: true` o interpretador de comandos parte o
 *  caminho no espaço e tenta executar `K:\SPBIM`. É a mesma armadilha que o
 *  `dev.mjs` documenta, do outro lado: lá o problema era não usar shell para o
 *  npm, aqui é usar shell para o que não é `.cmd`. */
const precisaShell = (cmd) => WIN && !/\.exe$/i.test(cmd)

/** Com shell, o comando vai como UMA STRING e não como comando + vetor: o Node
 *  24 deprecou a segunda forma (ele concatena sem escapar, o que é o mesmo que
 *  a string, só que fingindo que não é). Sem shell, o vetor é o certo — é ele
 *  que faz o caminho com espaço chegar inteiro. */
const invocar = (cmd, args, extra) =>
  precisaShell(cmd)
    ? spawnSync([cmd, ...args].join(' '), { ...extra, shell: true })
    : spawnSync(cmd, args, extra)

/** Roda e ECOA a saída. O `pip install` leva minutos: um script mudo nesse
 *  tempo parece travado, e quem está esperando o mata. */
function rodar(cmd, args, cwd) {
  return invocar(cmd, args, { cwd, stdio: 'inherit' }).status === 0
}

function saida(cmd, args) {
  const r = invocar(cmd, args, { encoding: 'utf8' })
  return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
}

/** O interpretador 3.12, procurado nas formas que cada sistema oferece.
 *
 *  3.12 E NÃO "a mais nova": o IfcOpenShell e o psycopg distribuem wheels até
 *  ela, e numa 3.13 a instalação falha lá no fim, depois de baixar tudo, com um
 *  erro de compilação que não menciona versão nenhuma. */
function acharPython() {
  const candidatos = WIN
    ? [['py', ['-3.12']], ['python3.12', []], ['python', []]]
    : [['python3.12', []], ['python3', []], ['python', []]]
  for (const [cmd, pre] of candidatos) {
    const v = saida(cmd, [...pre, '--version'])
    if (/^Python 3\.12\./.test(v)) return { cmd, pre, versao: v }
  }
  return null
}

console.log(cor('1', '\nSPBIM · preparando a máquina para o repositório\n'))

// ------------------------------------------------------------------ 1. versões
passo('Conferindo as versões')

const py = acharPython()
if (!py) {
  const achado = saida(WIN ? 'python' : 'python3', ['--version']) || 'nenhum Python no PATH'
  morrer(
    `Python 3.12 não encontrado (achei: ${achado}).`,
    WIN
      ? 'Instale com:  winget install --id Python.Python.3.12 -e --scope user\n' +
          '    Não use 3.13/3.14: o IfcOpenShell e o psycopg só têm wheels até a 3.12.'
      : 'Instale o Python 3.12 pelo gerenciador do seu sistema (apt, brew, pyenv).',
  )
}
ok(`${py.versao}`)

const nodeMaior = Number(process.versions.node.split('.')[0])
if (nodeMaior < 20) morrer(`Node ${process.versions.node} é antigo demais.`, 'Instale o Node 20+.')
ok(`Node ${process.versions.node}`)

// ------------------------------------------------------------------ 2. backend
passo('Backend — ambiente virtual e dependências')

if (existsSync(PY_VENV)) {
  ok('backend/.venv já existe (não vou recriar)')
} else {
  console.log('  criando backend/.venv…')
  if (!rodar(py.cmd, [...py.pre, '-m', 'venv', '.venv'], BACKEND)) {
    morrer('Falhou criar o ambiente virtual.')
  }
  ok('backend/.venv criado')
}

console.log('  instalando o backend (leva alguns minutos na primeira vez)…')
if (!rodar(PY_VENV, ['-m', 'pip', 'install', '-q', '--upgrade', 'pip'], BACKEND)) {
  aviso('não consegui atualizar o pip — seguindo com a versão que veio')
}
if (!rodar(PY_VENV, ['-m', 'pip', 'install', '-e', '.[dev]'], BACKEND)) {
  morrer(
    'Falhou instalar as dependências do backend.',
    'Sem rede? Atrás de proxy? O erro completo está acima.',
  )
}
ok('dependências do backend instaladas')

// ----------------------------------------------------------------- 3. frontend
passo('Frontend — dependências')

console.log('  npm install…')
if (!rodar('npm', ['install'], FRONTEND)) morrer('Falhou o npm install do frontend.')
ok('dependências do frontend instaladas')

// --------------------------------------------------------------------- 4. .env
passo('Configuração (.env)')

const env = join(RAIZ, '.env')
if (existsSync(env)) {
  ok('.env já existe (não vou tocar nele)')
} else {
  const exemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8')
  // `base64url` para o segredo caber numa linha sem aspas nem escape — é o
  // mesmo alfabeto do `secrets.token_urlsafe` que o README manda usar.
  const segredo = randomBytes(48).toString('base64url')
  writeFileSync(
    env,
    exemplo.replace('JWT_SECRET=troque-este-valor-em-producao', `JWT_SECRET=${segredo}`),
    'utf8',
  )
  ok('.env criado a partir do .env.example, com um JWT_SECRET só seu')
  aviso('ele aponta para um Postgres em localhost — ver o próximo passo')
}

// --------------------------------------------------------------- 5. identidade
passo('Identidade do git')

// A IDENTIDADE É DE QUEM DIGITA, mesmo quando a conta do GitHub é compartilhada.
// São coisas diferentes: a CONTA é a credencial que empurra, o AUTOR é o nome
// que fica gravado em cada commit e é o que o `git blame` responde daqui a seis
// meses. Com os dois iguais, "quem fez isto, e por quê?" deixa de ter resposta —
// e neste repositório essa pergunta é o que mais se faz.
const nomeGit = saida('git', ['config', 'user.name'])
const emailGit = saida('git', ['config', 'user.email'])
if (nomeGit && emailGit) {
  ok(`seus commits sairão como ${nomeGit} <${emailGit}>`)
  aviso('se este for o e-mail COMPARTILHADO da equipe, troque pelo seu — ver abaixo')
} else {
  aviso('sem identidade configurada; os commits sairão sem autor reconhecível')
}
console.log('    git config user.name "Seu Nome"')
console.log('    git config user.email "voce@spbim.com"')
console.log('    (sem --global: vale só neste repositório)')

// ------------------------------------------------------------------ o que falta
console.log(`\n${cor('1;32', '✓')} ${cor('1', 'Máquina pronta.')} Falta o banco, que é escolha sua:\n`)
console.log(`  ${cor('1', 'Com Docker')} (o caminho curto)`)
console.log('    docker compose up -d db redis minio')
console.log(`\n  ${cor('1', 'Sem Docker')}`)
console.log('    Instale o PostgreSQL 16 e rode uma vez, como superusuário:')
console.log('    psql -U postgres -c "CREATE DATABASE spbim_auditoria"')
console.log('    psql -U postgres -d spbim_auditoria -f infra/postgres/init/01-app-role.sql')
console.log(`\n  ${cor('1', 'Depois, em qualquer um dos dois:')}`)
console.log(`    ${WIN ? 'backend\\.venv\\Scripts\\python.exe' : 'backend/.venv/bin/python'} -m alembic upgrade head`)
console.log('    (de dentro de backend/, para criar o schema)\n')
console.log(`  ${cor('1', 'E então:')}  npm run dev\n`)
console.log(`  O passo a passo completo está em ${cor('4', 'docs/COLABORACAO.md')}.\n`)
