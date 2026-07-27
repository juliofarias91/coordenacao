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
  overrides: [
    {
      // Camada de lógica portada do Auditer, em JavaScript e sem alteração.
      // Ela tem suíte própria (`npm test`, scripts/naming.test.mjs) e os casos
      // de borda que a sustentam — data com mês 13, 29/02 em ano não bissexto,
      // extensão dupla — foram pagos ali. Reescrever para agradar ao lint
      // arriscaria comportamento validado sem ganhar nada.
      files: ['src/lib/auditer/**/*.js', 'src/workers/*.js'],
      rules: {
        'no-empty': ['error', { allowEmptyCatch: true }],
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        // `useSpellChecker` lê `pending.current` na limpeza do efeito de
        // propósito: no desmonte queremos esvaziar o mapa que existir NAQUELE
        // instante, não uma cópia congelada na montagem. A regra assume que ler
        // a ref tardiamente é engano; aqui é o comportamento pedido.
        'react-hooks/exhaustive-deps': 'off',
      },
    },
  ],
}
