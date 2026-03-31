import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { initVault, setTemplatesDir } from '../lib/vaultFs'
import { setVaultPath as syncDbVaultPath } from '../db/index'

const VaultContext = createContext(null)

export function VaultProvider({ children }) {
  const [vaultPath, setVaultPath] = useState(null)
  const [loading, setLoading] = useState(true)

  // Helper: sets BOTH the React state AND the db module variable atomically
  function applyVaultPath(path) {
    syncDbVaultPath(path)   // ← db/index.js module var (used by vault fs functions)
    setVaultPath(path)      // ← React state (used by components to re-render)
  }

  // On mount: restore vault path from electron config
  useEffect(() => {
    async function check() {
      if (!window.electron) {
        // Web mode — no vault, Dexie fallback
        setLoading(false)
        return
      }
      const saved = await window.electron.getConfig('vaultPath')
      if (saved) {
        const exists = await window.electron.exists(saved)
        if (exists) {
          applyVaultPath(saved)
        }
      }
      // Carrega pasta de templates configurada
      const savedTemplatesDir = await window.electron.getConfig('templatesDir').catch(() => null)
      if (savedTemplatesDir) setTemplatesDir(savedTemplatesDir)
      setLoading(false)
    }
    check()
  }, [])

  const chooseVault = useCallback(async () => {
    if (!window.electron) return
    const chosen = await window.electron.openFolder()
    if (!chosen) return
    await initVault(chosen)
    await window.electron.setConfig('vaultPath', chosen)
    applyVaultPath(chosen)
  }, [])

  const changeVault = useCallback(async () => {
    const chosen = await window.electron.openFolder()
    if (!chosen) return
    await initVault(chosen)
    await window.electron.setConfig('vaultPath', chosen)
    applyVaultPath(chosen)
  }, [])

  return (
    <VaultContext.Provider value={{ vaultPath, loading, chooseVault, changeVault }}>
      {children}
    </VaultContext.Provider>
  )
}

export function useVault() {
  return useContext(VaultContext)
}
