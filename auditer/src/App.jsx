import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import Auditoria from './pages/Auditoria'
import Padroes from './pages/Padroes'
import Aceitas from './pages/Aceitas'
import { loadIgnoreWords, loadPatterns, saveIgnoreWords, savePatterns } from './lib/storage'

export default function App() {
  const [patterns, setPatterns] = useState(loadPatterns)
  const [ignoreWords, setIgnoreWords] = useState(loadIgnoreWords)

  // As chaves importam: savePatterns devolve boolean e o React trataria
  // qualquer retorno do efeito como função de limpeza.
  useEffect(() => {
    savePatterns(patterns)
  }, [patterns])

  useEffect(() => {
    saveIgnoreWords(ignoreWords)
  }, [ignoreWords])

  const addIgnoreWord = useCallback((word) => {
    setIgnoreWords((prev) => {
      const key = word.trim().toLowerCase()
      if (!key) return prev
      return prev.some((w) => w.toLowerCase() === key) ? prev : [...prev, word.trim()]
    })
  }, [])

  const removeIgnoreWord = useCallback((word) => {
    const key = word.toLowerCase()
    setIgnoreWords((prev) => prev.filter((w) => w.toLowerCase() !== key))
  }, [])

  const clearIgnoreWords = useCallback(() => setIgnoreWords([]), [])

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Auditoria patterns={patterns} ignoreWords={ignoreWords} onIgnoreWord={addIgnoreWord} />} />
        <Route path="/padroes" element={<Padroes patterns={patterns} setPatterns={setPatterns} />} />
        <Route
          path="/aceitas"
          element={
            <Aceitas
              ignoreWords={ignoreWords}
              onAdd={addIgnoreWord}
              onRemove={removeIgnoreWord}
              onClear={clearIgnoreWords}
            />
          }
        />
      </Routes>
    </Shell>
  )
}
