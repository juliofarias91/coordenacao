import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  // O corretor ortográfico roda num module worker (`src/workers/spell.worker.js`).
  worker: { format: 'es' },
  resolve: {
    // O REPOSITÓRIO VIVE NUM DRIVE MAPEADO (K: → \\bimserver01\Deptos$).
    // Sem isto o Vite chama `realpath` na raiz, recebe o caminho UNC de volta,
    // e depois o re-resolve contra a raiz do drive: some um
    // `K:\bimserver01\Deptos$\…\src\main.tsx` que não existe e o build morre em
    // "Could not load … main.tsx". `preserveSymlinks` desliga esse realpath.
    // Não remova enquanto o projeto estiver em unidade de rede.
    preserveSymlinks: true,
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // O build ESM do hunspell-asm faz `import * as runtime from './lib/node/hunspell'`,
      // um arquivo CommonJS. Sob o interop do Vite isso vira um namespace ({default: fn})
      // em vez da função, e o loader morre com "runtimeModule is not a function".
      // O build CJS usa require() e recebe a função certa — daí apontar para ele.
      // Não remova.
      'hunspell-asm': 'hunspell-asm/dist/cjs/index.js',
    },
  },
  // Ambos são CommonJS: o pré-bundle os converte para ESM, sem o qual o import
  // dentro do worker quebra.
  optimizeDeps: { include: ['hunspell-asm', 'xlsx'] },
  server: {
    port: 5173,
    // Mesma razão do `preserveSymlinks`: o watcher nativo do SO não observa
    // compartilhamento de rede — `Error: UNKNOWN: unknown error, watch` derruba
    // o processo assim que o servidor sobe. Polling custa um pouco de CPU e é o
    // único jeito de ter hot-reload aqui.
    watch: { usePolling: true, interval: 400 },
    // A API roda em :8000. O proxy evita CORS no desenvolvimento.
    //
    // `API_URL` sobrescreve o alvo, e é o que o `npm run dev:web` usa para
    // apontar a aplicação para uma API JÁ PUBLICADA — aí o dev sobe um processo
    // só, sem backend local. Ver `scripts/dev.mjs`.
    proxy: {
      '/api': {
        target: process.env.API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
