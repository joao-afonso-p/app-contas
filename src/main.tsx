import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { registerInstallPrompt } from './lib/installPrompt'

registerInstallPrompt()
// Pede armazenamento persistente (best-effort) para reduzir o risco de o browser apagar os dados.
void navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
