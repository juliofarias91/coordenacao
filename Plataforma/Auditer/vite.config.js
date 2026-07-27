import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      // O build ESM do hunspell-asm faz `import * as runtime from './lib/node/hunspell'`,
      // um arquivo CommonJS. Sob o interop do Vite isso vira um namespace ({default: fn})
      // em vez da função, e o loader morre com "runtimeModule is not a function".
      // O build CJS usa require() e recebe a função certa — daí apontar para ele.
      'hunspell-asm': 'hunspell-asm/dist/cjs/index.js',
    },
  },
  // Ambos são CommonJS: o pré-bundle os converte para ESM, sem o qual o import
  // dentro do worker quebra.
  optimizeDeps: { include: ['hunspell-asm', 'xlsx'] },
  server: { port: 5173, open: true },
})
