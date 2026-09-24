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

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (_registration) => { },
      (error) => {
        console.error('[SW] Registration failed:', error)
      }
    )
  })
}
