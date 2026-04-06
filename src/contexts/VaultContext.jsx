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
    let mounted = true
    async function check() {
      if (!window.electron) {
        if (mounted) setLoading(false)
        return
      }
      const saved = await window.electron.getConfig('vaultPath')
      if (!mounted) return
      if (saved) {
        const exists = await window.electron.exists(saved)
        if (!mounted) return
        if (exists) {
          applyVaultPath(saved)
        }
      }
      // Carrega pasta de templates configurada
      const savedTemplatesDir = await window.electron.getConfig('templatesDir').catch(() => null)
      if (!mounted) return
      if (savedTemplatesDir) setTemplatesDir(savedTemplatesDir)
      setLoading(false)
    }
    check()
    return () => { mounted = false }
  }, [])

  const chooseVault = useCallback(async () => {
    if (!window.electron) return
    const chosen = await window.electron.openFolder()
    if (!chosen) return
    // CRÍTICO: setConfig ANTES de initVault. O validatePath em main.cjs lê
    // o vault atual do config.json pra decidir se o mkdir/writeFile é permitido.
    // Se a gente rodar initVault primeiro, ele tenta mexer em paths que main.cjs
    // ainda considera "fora do vault".
    await window.electron.setConfig('vaultPath', chosen)
    await initVault(chosen)
    applyVaultPath(chosen)
  }, [])

  const changeVault = useCallback(async () => {
    const chosen = await window.electron.openFolder()
    if (!chosen) return
    // CRÍTICO: setConfig ANTES de initVault — ver comentário em chooseVault.
    await window.electron.setConfig('vaultPath', chosen)
    await initVault(chosen)
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
