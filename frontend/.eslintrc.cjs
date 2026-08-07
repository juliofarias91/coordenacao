module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  // O `overrides` que havia aqui era só para `src/lib/auditer/**/*.js` e
  // `src/workers/*.js` — a camada de lógica portada do Auditer, em JavaScript e
  // sem alteração, que afrouxava três regras para não ser reescrita. As duas
  // pastas saíram em 07/08/2026 com o módulo inteiro, e não há mais JavaScript
  // em `src/`: tudo é TypeScript.
}
