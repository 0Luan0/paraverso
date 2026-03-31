import { useState, useEffect } from 'react'
import { useTheme } from './hooks/useTheme'
import { useTexture } from './hooks/useTexture'
import { VaultProvider, useVault } from './contexts/VaultContext'
import { TopBar } from './components/layout/TopBar'
import { NavTabs } from './components/layout/NavTabs'
import { MesTab } from './components/mes/MesTab'
import { NotasTab } from './components/notas/NotasTab'
import { BuscaTab } from './components/placeholders/BuscaTab'
import { GraphTab } from './components/placeholders/GraphTab'
import { ConfigTab } from './components/config/ConfigTab'
import { QuickSwitcher } from './components/QuickSwitcher'
import { VaultSetup } from './components/VaultSetup'

// ── Inner app — has access to VaultContext ────────────────────────────────────
function AppInner() {
  const { dark, toggleTheme } = useTheme()
  const { textura, cycleTextura } = useTexture()
  const { vaultPath, loading } = useVault()
  const [aba, setAba] = useState('mes')
  const [quickSwitcher, setQuickSwitcher] = useState(false)
  const [notaPendente, setNotaPendente] = useState(null)
  const [notaAtivaId, setNotaAtivaId] = useState(null)

  // ── Atalhos globais de teclado ─────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd+O — Quick switcher (abrir nota)
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        setQuickSwitcher(true)
        return
      }

      // Cmd+N — Nova nota (vai para aba Notas e cria)
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        setAba('notas')
        // Pequeno delay para garantir que a aba montou antes do evento
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('paraverso:nova-nota'))
        }, 50)
        return
      }

      // Cmd+F — Abre find bar inline no editor
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('paraverso:find'))
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // ── Abre nota vinda do QuickSwitcher ou BuscaTab ─────────────────────────
  // Usa props (notaPendente) em vez de setTimeout+evento — sem race conditions.
  function handleAbrirNota(nota) {
    setNotaPendente(nota)
    setAba('notas')
  }

  // Evento global: qualquer componente pode pedir "abrir esta nota na aba Notas"
  useEffect(() => {
    function onAbrirEmNotas(e) { handleAbrirNota(e.detail?.nota) }
    window.addEventListener('paraverso:abrir-em-notas', onAbrirEmNotas)
    return () => window.removeEventListener('paraverso:abrir-em-notas', onAbrirEmNotas)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Still loading vault path from config
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg dark:bg-bg-dark">
        <span className="text-sm text-ink-2 dark:text-ink-dark2">Carregando...</span>
      </div>
    )
  }

  // Electron + no vault chosen yet → show setup screen
  if (window.electron && !vaultPath) {
    return <VaultSetup />
  }

  return (
    <div className="h-screen flex flex-col bg-bg dark:bg-bg-dark overflow-hidden">
      {/* Quick Switcher overlay (Cmd+O) */}
      {quickSwitcher && (
        <QuickSwitcher
          onClose={() => setQuickSwitcher(false)}
          onAbrirNota={handleAbrirNota}
        />
      )}

      <TopBar
        dark={dark}
        toggleTheme={toggleTheme}
        textura={textura}
        cycleTextura={cycleTextura}
      />
      <NavTabs aba={aba} setAba={setAba} />

      <div className="flex-1 flex overflow-hidden">
        {aba === 'mes'    && <MesTab />}
        {/* NotasTab mantido montado (display:none) para preservar estado ao trocar de aba */}
        <div style={{ display: aba === 'notas' ? 'contents' : 'none' }}>
          <NotasTab textura={textura} notaPendente={notaPendente} onNotaAberta={() => setNotaPendente(null)} onNotaAtiva={setNotaAtivaId} />
        </div>
        {aba === 'busca'  && <BuscaTab />}
        {aba === 'grafo'  && <GraphTab dark={dark} />}
        {aba === 'config' && <ConfigTab />}
      </div>
    </div>
  )
}

// ── Root — wraps with VaultProvider ──────────────────────────────────────────
function App() {
  return (
    <VaultProvider>
      <AppInner />
    </VaultProvider>
  )
}

export default App
