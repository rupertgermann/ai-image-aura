import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './session/SessionContext'
import { MigrationGate } from './session/MigrationGate'
import { localStorageMigrator, sessionHydrator } from './session/sessionBootstrap'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider hydrator={sessionHydrator}>
      <MigrationGate migrator={localStorageMigrator} hydrator={sessionHydrator}>
        <App />
      </MigrationGate>
    </SessionProvider>
  </StrictMode>,
)
