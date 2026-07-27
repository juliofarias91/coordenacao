import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from '@/App'
import { AuthProvider } from '@/auth/AuthContext'
import { I18nProvider } from '@/i18n'
import '@/styles/tokens.css'
import '@/styles/app.css'
import { ThemeProvider } from '@/theme/ThemeProvider'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('elemento #root não encontrado')

ReactDOM.createRoot(raiz).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
