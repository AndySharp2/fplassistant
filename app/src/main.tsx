import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppDataProvider } from './context/AppDataContext'

const APP_STATE_VERSION = '2026-08-20-4'

async function invalidateStaleClientState(): Promise<void> {
  const storedVersion = sessionStorage.getItem('fpl-app-version')
  if (storedVersion === APP_STATE_VERSION) return

  sessionStorage.setItem('fpl-app-version', APP_STATE_VERSION)

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
    }
  } catch {
    // If cache cleanup fails, continue with a normal render.
  }

  window.location.reload()
}

void invalidateStaleClientState()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppDataProvider key={APP_STATE_VERSION}>
      <App />
    </AppDataProvider>
  </StrictMode>,
)
