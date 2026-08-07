import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'

// TRÊS AJUSTES SAÍRAM DAQUI EM 07/08/2026, com o módulo de auditoria de
// arquivos: `worker: { format: 'es' }` (o corretor ortográfico rodava num module
// worker), o alias `hunspell-asm → dist/cjs/index.js` e o
// `optimizeDeps: { include: ['hunspell-asm', 'xlsx'] }`. Os três existiam por
// causa de dependências que este projeto não tem mais — ver o cabeçalho de
// `pages/configuracao/Nomenclaturas.tsx`. Se o módulo voltar, os três voltam
// juntos: `git log -- frontend/vite.config.ts`.
export default defineConfig({
  plugins: [react()],
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
    },
  },
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
