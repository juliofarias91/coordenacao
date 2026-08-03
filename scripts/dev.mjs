/**
 * Sobe a plataforma para desenvolvimento: a API e a aplicação React.
 *
 *   node scripts/dev.mjs            API :8000 + Vite :5173  (`npm run dev`)
 *   node scripts/dev.mjs --web      SÓ o Vite, contra a API já publicada
 *   node scripts/dev.mjs --unico    só :8000, servindo o build — como produção
 *   node scripts/dev.mjs --parar    encerra o que estiver nas duas portas
 *
 * POR QUE NODE E NÃO O `dev.ps1` DE ANTES. O PowerShell abria a API numa
 * JANELA SEPARADA (`Start-Process -NoExit`), e era isso o incômodo: começava
 * um terminal novo a cada `npm run dev`, e fechar a sessão deixava a janela
 * órfã atrás. Aqui os dois processos são filhos deste, no MESMO terminal, com
 * a saída prefixada — `Ctrl+C` derruba a árvore inteira e não sobra nada.
 *
 * De brinde deixou de ser específico do Windows: o mesmo arquivo serve Linux e
 * macOS, que é onde o CI e a imagem rodam.
 *
 * ESTE ARQUIVO É A FONTE DE VERDADE de como a plataforma sobe. O `dev.ps1`
 * continua existindo, mas virou uma casca que chama isto — duas
 * implementações de "subir os dois processos" divergiriam na primeira mudança
 * de porta.
 */
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { existsSync, cpSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)))
const BACKEND = join(RAIZ, 'backend')
const FRONTEND = join(RAIZ, 'frontend')

const WIN = process.platform === 'win32'
const PYTHON = WIN
  ? join(BACKEND, '.venv', 'Scripts', 'python.exe')
  : join(BACKEND, '.venv', 'bin', 'python')
/** O npm sai pelo SHELL, e como UMA STRING — não como comando + array.
 *
 *  Duas armadilhas do Node no Windows, nesta ordem:
 *
 *  1. `npm` é um `.cmd`, e desde a correção do CVE-2024-27980 o Node RECUSA
 *     lançar `.cmd`/`.bat` sem `shell: true`: dá `spawn EINVAL`, que não diz
 *     nada sobre a causa.
 *  2. Com `shell: true`, passar os argumentos em ARRAY dispara o aviso DEP0190
 *     ("args are not escaped, only concatenated") em todo start. String única é
 *     a forma sancionada — e aqui não há entrada de usuário para escapar.
 *
 *  O `python.exe` é executável de verdade: vai direto, sem shell.
 *
 *  O `cwd` NUNCA entra na linha de comando: o caminho deste repositório tem
 *  espaços, e no shell isso viraria dois argumentos. */
const OPC_SHELL = { shell: true }

const PORTAS = { api: 8000, web: 5173 }

const cor = { api: '\x1b[36m', web: '\x1b[35m', aviso: '\x1b[33m', off: '\x1b[0m' }

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

/** Quem está OUVINDO nesta porta. Vazio se ninguém.
 *
 *  Duas ferramentas porque não há uma só: `netstat`/`taskkill` no Windows,
 *  `lsof` no resto. Nenhuma das duas é PowerShell, que é o ponto. */
function pidsNaPorta(porta) {
  if (WIN) {
    // SEM `-p tcp`: esse filtro devolve só IPv4, e o Vite ouve em `[::1]`. Com
    // ele, `pararPorta(5173)` não achava nada, a porta seguia ocupada e o Vite
    // novo subia calado na 5174 — a aplicação abria no endereço errado.
    const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8' })
    return [
      ...new Set(
        (r.stdout || '')
          .split('\n')
          .filter((l) => /LISTENING/i.test(l) && new RegExp(`:${porta}\\s`).test(l))
          .map((l) => l.trim().split(/\s+/).pop())
          .filter((p) => p && p !== '0'),
      ),
    ]
  }
  const r = spawnSync('lsof', ['-ti', `tcp:${porta}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  return (r.stdout || '').split('\n').filter(Boolean)
}

/** Os processos VIVOS cujo pai está nesta lista.
 *
 *  É como se acha o órfão: `uvicorn --reload` roda um recarregador que gera um
 *  WORKER, e é o worker que segura o socket. Quando o recarregador morre sem
 *  levar o filho, o `netstat` continua atribuindo a porta ao pid do PAI — que já
 *  não existe. Matar aquele pid não faz nada, e a 8000 segue servindo código
 *  velho. Procurar por parentesco encontra quem realmente está lá. */
function filhosVivosDe(pidsPais) {
  if (!WIN || pidsPais.length === 0) return []
  // Colunas saem em ordem alfabética: ParentProcessId, ProcessId.
  const r = spawnSync('wmic', ['process', 'get', 'ParentProcessId,ProcessId'], {
    encoding: 'utf8',
  })
  return (r.stdout || '')
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c.length === 2 && pidsPais.includes(c[0]))
    .map((c) => c[1])
}

function matar(pid) {
  const r = WIN
    ? spawnSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' })
    : spawnSync('kill', ['-9', pid], { stdio: 'ignore' })
  return r.status === 0
}

/** Libera a porta e DIZ A VERDADE sobre o que conseguiu.
 *
 *  A versão anterior imprimia "encerrado" para todo pid que o `netstat`
 *  devolvia, sem olhar se o `taskkill` funcionou — e como o `netstat` lista
 *  sockets de processos que já morreram, ela anunciava sucesso enquanto a porta
 *  seguia ocupada. Relatório que mente é pior que ausência de relatório: mandou
 *  procurar o problema em outro lugar. */
function pararPorta(porta, rotulo) {
  const pids = pidsNaPorta(porta)
  if (pids.length === 0) return false

  let mortos = 0
  // Os órfãos ANTES dos pais: matando o pai primeiro, o `wmic` perde o vínculo
  // e o filho vira invisível para esta busca.
  for (const pid of [...filhosVivosDe(pids), ...pids]) {
    if (matar(pid)) mortos++
  }

  if (pidsNaPorta(porta).length > 0) {
    log(`  ${cor.aviso}porta ${porta} continua ocupada — feche o processo à mão${cor.off}`)
    return true
  }
  if (mortos > 0) log(`  ${rotulo} (porta ${porta}) encerrado`)
  return true
}

/** Prefixa cada linha do filho. Sem isto, dois processos escrevendo no mesmo
 *  terminal produzem um log em que não se sabe quem falhou — e o log da API é o
 *  primeiro lugar onde se olha quando uma tela responde errado. */
function encaminhar(filho, rotulo) {
  const prefixo = `${cor[rotulo]}[${rotulo}]${cor.off} `
  for (const fluxo of [filho.stdout, filho.stderr]) {
    if (!fluxo) continue
    let resto = ''
    fluxo.on('data', (pedaco) => {
      const linhas = (resto + pedaco).split('\n')
      resto = linhas.pop() ?? ''
      for (const l of linhas) process.stdout.write(prefixo + l + '\n')
    })
    // A DESCARGA NO FIM não é detalhe: o buffer guarda a última linha sem `\n`,
    // e é justamente ali que termina um traceback de processo que morreu. Sem
    // isto, o filho sai com erro e o terminal não mostra o porquê — foi o que
    // me fez perseguir a causa de uma saída da API às cegas.
    fluxo.on('close', () => {
      if (resto) process.stdout.write(prefixo + resto + '\n')
    })
  }
}

// ------------------------------------------------------------------ --parar
if (process.argv.includes('--parar')) {
  log('\nEncerrando...')
  // As duas chamadas ANTES do `||`: em linha, o curto-circuito pulava o Vite
  // sempre que a API estivesse de pé — e `--parar` deixava a 5173 ocupada.
  const api = pararPorta(PORTAS.api, 'API')
  const web = pararPorta(PORTAS.web, 'Vite')
  if (!api && !web) log('  nada rodando')
  log('')
  process.exit(0)
}

const WEB = process.argv.includes('--web')
const UNICO = process.argv.includes('--unico')

// O venv só é exigido quando a API vai subir. No `--web` ela é remota, e cobrar
// um ambiente Python de quem só vai mexer em tela seria pedir o que não se usa.
if (!WEB && !existsSync(PYTHON)) {
  log(`\n${cor.aviso}O ambiente Python nao existe em backend/.venv${cor.off}`)
  log('  py -3.12 -m venv backend\\.venv')
  log('  backend\\.venv\\Scripts\\python.exe -m pip install -e "backend[dev,bim]"\n')
  process.exit(1)
}

/** Um valor do `.env` da raiz. Sem dependência: são pares `CHAVE=valor`.
 *
 *  Não é para configurar a aplicação — quem faz isso é o Pydantic Settings, no
 *  backend. É só para o lançador achar o endereço da API publicada sem obrigar
 *  a exportar variável em toda sessão do terminal. */
function lerDoEnv(chave) {
  try {
    for (const linha of readFileSync(join(RAIZ, '.env'), 'utf8').split('\n')) {
      const m = linha.match(new RegExp(`^\\s*${chave}\\s*=\\s*(.+?)\\s*$`))
      if (m) return m[1].replace(/^["']|["']$/g, '').split('#')[0].trim()
    }
  } catch {
    /* sem .env: o chamador trata */
  }
  return ''
}

/** A URL responde? Usado só para avisar cedo, nunca para bloquear. */
async function responde(url, tetoMs = 8000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(tetoMs) })
    return r.ok
  } catch {
    return false
  }
}

// Porta ocupada de uma execução anterior derruba a nova sem explicar por quê.
if (!WEB) pararPorta(PORTAS.api, 'API anterior')
if (!UNICO) pararPorta(PORTAS.web, 'Vite anterior')

const filhos = []

/** Derruba tudo: por PID e depois por PORTA.
 *
 *  A varredura de portas não é redundância — é o que de fato funciona para o
 *  Vite. Ele sai por `shell: true` (o npm é um `.cmd`), então o `pid` que
 *  guardamos é o do `cmd.exe`, não o do Vite: a cadeia é
 *  `cmd.exe → npm.cmd → node`. Quando o shell intermediário já saiu, matar
 *  aquele pid não alcança neto nenhum, e o Vite fica servindo sozinho na 5173
 *  depois de a API cair. Foi exatamente o que aconteceu — API fora, aplicação
 *  de pé, cada tela respondendo erro.
 *
 *  Por porta é o único critério que não depende de quem é filho de quem.
 */
function encerrarTudo(codigo = 0) {
  for (const f of filhos) {
    if (f.exitCode === null) {
      if (WIN) spawnSync('taskkill', ['/F', '/T', '/PID', String(f.pid)], { stdio: 'ignore' })
      else f.kill('SIGTERM')
    }
  }
  pararPorta(PORTAS.api, 'API')
  pararPorta(PORTAS.web, 'Vite')
  process.exit(codigo)
}
process.on('SIGINT', () => encerrarTudo(0))
process.on('SIGTERM', () => encerrarTudo(0))

/** Registra o filho e amarra os dois fins possíveis dele.
 *
 *  O `error` é tão importante quanto o `exit`: quando o `spawn` falha (binário
 *  ausente, `.cmd` sem shell), o Node emite `error` e, sem ouvinte, a exceção
 *  sobe e mata o pai — deixando os OUTROS filhos vivos e órfãos. Foi o que
 *  aconteceu no primeiro teste: o `npm.cmd` deu `EINVAL`, o lançador morreu e a
 *  API ficou ouvindo na 8000 sozinha. */
function acompanhar(f, rotulo) {
  encaminhar(f, rotulo)
  filhos.push(f)
  f.on('error', (e) => {
    log(`${cor.aviso}Nao consegui iniciar ${rotulo}: ${e.message}${cor.off}`)
    encerrarTudo(1)
  })
  // Um sem o outro só engana: sem API, toda tela responde erro; sem Vite, não
  // há aplicação para abrir.
  f.on('exit', (c) => {
    log(`${cor.aviso}${rotulo} saiu (codigo ${c}). Encerrando.${cor.off}`)
    encerrarTudo(c ?? 1)
  })
  return f
}

function subirApi({ reload }) {
  const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PORTAS.api)]
  if (reload) {
    // `--reload-dir app`: SÓ o código da aplicação. Sem isto o WatchFiles vigia
    // `backend/` inteiro — e editar uma migration, um teste ou um script
    // reiniciava a API sem nenhum motivo, com dez segundos de importação a cada
    // salvamento. Migration não é código quente: ela roda no `alembic`, não no
    // servidor.
    args.push('--reload', '--reload-dir', 'app')
  }
  return acompanhar(spawn(PYTHON, args, { cwd: BACKEND }), 'api')
}

/** Resolve quando a porta aceitar conexão, ou depois do teto.
 *
 *  EXISTE PARA O VITE NÃO SUBIR ANTES DA API. O Vite fica pronto em ~3 s e a
 *  API leva mais (o `import` da aplicação, num projeto que vive em drive de
 *  rede), então o navegador
 *  abria, pedia `/auth/me` e tomava ECONNREFUSED — que o Vite despeja no
 *  terminal com um AggregateError de cinco linhas, três ou quatro vezes, antes
 *  de qualquer coisa funcionar. Parecia erro e não era: era só a ordem.
 */
function esperarPorta(porta, tetoMs = 60_000) {
  const limite = Date.now() + tetoMs
  return new Promise((resolve) => {
    const tentar = () => {
      const s = net.connect({ port: porta, host: '127.0.0.1' })
      s.once('connect', () => {
        s.destroy()
        resolve(true)
      })
      s.once('error', () => {
        s.destroy()
        if (Date.now() > limite) return resolve(false)
        setTimeout(tentar, 300)
      })
    }
    tentar()
  })
}

// --------------------------------------------------------------------- --web
// SÓ A APLICAÇÃO, contra uma API já publicada. É o arranjo do VDCity: lá o
// backend (SQL + edge functions) vive na Supabase e nunca sobe no dev, e é por
// isso que o `npm run dev` de lá é um processo só.
//
// Vale quando se mexe em TELA — e aí o backend local não serve para nada além
// de custar o boot e metade do log. NÃO é o padrão, de propósito: bate-se
// contra uma instância COMPARTILHADA, e se o schema dela estiver diferente do
// código em que se está mexendo, a tela quebra de um jeito que não se explica
// sozinho.
if (WEB) {
  const alvo = (process.env.API_REMOTA || lerDoEnv('API_REMOTA')).replace(/\/$/, '')
  if (!alvo) {
    log(`\n${cor.aviso}Falta a API_REMOTA.${cor.off}`)
    log('  Ponha no .env da raiz o endereço da API já publicada:')
    log('    API_REMOTA=https://<seu-dominio>')
    log(`\n  Ou use ${cor.aviso}npm run dev${cor.off}, que sobe a API local.\n`)
    process.exit(1)
  }

  log('\nSubindo SÓ a aplicação')
  log(`  aplicacao .... http://localhost:${PORTAS.web}     ${cor.aviso}<- abra esta${cor.off}`)
  log(`  API .......... ${alvo}  ${cor.aviso}(remota — não é a sua)${cor.off}`)
  log(`\n  ${cor.aviso}O backend local NÃO sobe. Para mexer na API, use npm run dev.${cor.off}\n`)

  // Conferir agora poupa a confusão de descobrir pela tela: um 502 no proxy
  // parece bug da aplicação, e manda procurar no lugar errado.
  if (!(await responde(`${alvo}/api/v1/health`))) {
    log(`${cor.aviso}Atenção: ${alvo} não respondeu ao /health.${cor.off}\n`)
  }

  acompanhar(
    spawn('npm run dev', { cwd: FRONTEND, ...OPC_SHELL, env: { ...process.env, API_URL: alvo } }),
    'web',
  )
}
// ------------------------------------------------------------------ --unico
else if (UNICO) {
  log('\n[1/2] compilando a aplicacao')
  const build = spawnSync('npm run build', { cwd: FRONTEND, stdio: 'inherit', ...OPC_SHELL })
  if (build.status !== 0) {
    log(`\n${cor.aviso}build falhou${cor.off}\n`)
    process.exit(1)
  }
  // É a presença de backend/static que faz a API servir a aplicação — ver
  // backend/app/spa.py.
  const estatico = join(BACKEND, 'static')
  rmSync(estatico, { recursive: true, force: true })
  cpSync(join(FRONTEND, 'dist'), estatico, { recursive: true })

  log('[2/2] subindo a API (serve API + aplicacao)\n')
  log(`  http://localhost:${PORTAS.api}  <- tudo aqui\n`)
  subirApi({ reload: false })
} else {
  // ------------------------------------------------------------- padrão
  log('\nSubindo a plataforma')
  log(`  API .......... http://localhost:${PORTAS.api}     (com --reload)`)
  log(`  aplicacao .... http://localhost:${PORTAS.web}     ${cor.aviso}<- abra esta${cor.off}`)
  log('  banco ........ Supabase (ver .env)')
  log(`\n  ${cor.aviso}Ctrl+C encerra as duas.${cor.off}\n`)

  subirApi({ reload: true })

  // EM SEQUÊNCIA, não em paralelo. Ver `esperarPorta`: o Vite pronto antes da
  // API enchia o terminal de ECONNREFUSED que não era erro nenhum, só ordem.
  log(`${cor.api}[api]${cor.off} aguardando a API responder…`)
  const noAr = await esperarPorta(PORTAS.api)
  if (!noAr) {
    log(`${cor.aviso}A API não subiu a tempo. O log dela está acima.${cor.off}`)
    encerrarTudo(1)
  }
  acompanhar(spawn('npm run dev', { cwd: FRONTEND, ...OPC_SHELL }), 'web')
}
