import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { whenReady } from './core/i18n'

const root = createRoot(document.getElementById('root')!)
whenReady.catch(() => undefined).then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
// PWA service worker registration is injected by vite-plugin-pwa (registerSW.js).
