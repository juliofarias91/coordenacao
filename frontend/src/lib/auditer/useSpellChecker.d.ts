/** Corretor ortográfico bilíngue (pt-BR + en-US) rodando num module worker.
 *
 *  Uma palavra só é erro quando falha nos DOIS idiomas — as planilhas do ACC
 *  misturam português e termo técnico em inglês. O inglês é opcional: se
 *  `en_US.*` não carregar, o worker degrada para só-pt em vez de derrubar a
 *  auditoria, e `langs` diz o que de fato subiu.
 */

/** Um texto auditável: conteúdo de célula ou nome de aba. */
export type EntradaTexto = {
  kind: 'cell' | 'sheet'
  sheet: string
  cell: string | null
  text: string
}

export type OcorrenciaOrtografia = EntradaTexto & {
  word: string
  /** Posição da palavra dentro de `text`, para destacá-la. */
  index: number
  suggestions: string[]
}

export type ErroCorretor = {
  /** 'dictionary' = os .aff/.dic não foram achados (falta rodar o copy-dict);
   *  'module'/'init' = o worker ou o wasm não subiu. */
  kind: 'dictionary' | 'init' | 'module'
  message: string
  detail: string
}

export function useSpellChecker(): {
  status: 'loading' | 'ready' | 'error'
  error: ErroCorretor | null
  check: (
    entries: EntradaTexto[],
    options: { ignoreWords: string[] },
  ) => Promise<OcorrenciaOrtografia[]>
  retry: () => void
  /** Idiomas efetivamente carregados, ex.: ['pt', 'en']. */
  langs: string[]
}
