import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { whenReady } from './core/i18n'

const root = createRoot(document.getElementById('root')!)
whenReady.catch((err) => console.warn('[main] i18n not ready; rendering anyway', err)).then(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
// Network-only service worker: PWA installability without offline caching.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[main] service worker registration failed', err))
  })
}
