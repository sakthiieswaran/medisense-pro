import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './storagePolyfill.js'
import './index.css'
import App from './MediSenseApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support: only register in production builds, so dev keeps its
// normal fast-refresh behavior instead of serving stale cached files.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
