import { useState, useEffect, useRef, useCallback } from 'react'
import { useTheme } from './hooks/useTheme'
import { useTexture } from './hooks/useTexture'
import { VaultProvider, useVault } from './contexts/VaultContext'
import ActivityBar from './components/layout/ActivityBar'
import { MesTab } from './components/mes/MesTab'
import { NotasTab } from './components/notas/NotasTab'
import { GraphTab } from './components/placeholders/GraphTab'
import { ConfigTab } from './components/config/ConfigTab'
import { QuickSwitcher } from './components/QuickSwitcher'
import { VaultSetup } from './components/VaultSetup'
import { TerminalPane } from './components/terminal/TerminalPane'

// ── Inner app — has access to VaultContext ────────────────────────────────────
function AppInner() {
  const { dark, toggleTheme } = useTheme()
  const { textura, cycleTextura, setTexturaTo } = useTexture()
  const { vaultPath, loading } = useVault()
  const [aba, setAba] = useState('notas')
  const [quickSwitcher, setQuickSwitcher] = useState(false)
  const [notaPendente, setNotaPendente] = useState(null)
  const [notaAtivaId, setNotaAtivaId] = useState(null)

  // Terminal panel state
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(() => {
    const saved = localStorage.getItem('paraverso-terminal-height')
    return saved ? parseInt(saved, 10) : 300
  })
  const [terminalKey, setTerminalKey] = useState(0)
  const isDraggingRef = useRef(false)
  const containerRef = useRef(null)

  const toggleTerminal = useCallback(() => {
    setTerminalOpen(prev => {
      if (!prev) {
        // Opening — increment key to force fresh mount
        setTerminalKey(k => k + 1)
      }
      return !prev
    })
  }, [])

  // Resize handle drag logic
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (moveEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newHeight = containerRect.bottom - moveEvent.clientY
      const clamped = Math.max(150, Math.min(newHeight, containerRect.height - 200))
      setTerminalHeight(clamped)
    }

    const onUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setTerminalHeight(h => {
        localStorage.setItem('paraverso-terminal-height', String(h))
        return h
      })
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // Limpa tema customizado legado (se existir)
  useEffect(() => { localStorage.removeItem('paraverso-tema-custom') }, [])

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

  // ── Abre nota vinda do QuickSwitcher ──────────────────────────────────────
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

  function handleNotaDia() {
    setAba('notas')
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('paraverso:journal'))
    }, 50)
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#1a1a1a' }}>
      {/* Quick Switcher overlay (Cmd+O) */}
      {quickSwitcher && (
        <QuickSwitcher
          onClose={() => setQuickSwitcher(false)}
          onAbrirNota={handleAbrirNota}
        />
      )}

      {/* Activity bar — coluna esquerda, 32px */}
      <ActivityBar
        abaAtiva={aba}
        onAbaChange={setAba}
        onNotaDia={handleNotaDia}
        terminalOpen={terminalOpen}
        onToggleTerminal={toggleTerminal}
      />

      {/* Conteúdo da aba ativa + terminal inferior */}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden min-w-0" style={terminalOpen ? { minHeight: 200 } : undefined}>
          {aba === 'mes'    && <MesTab />}
          {/* NotasTab mantido montado (display:none) para preservar estado ao trocar de aba */}
          <div style={{ display: aba === 'notas' ? 'contents' : 'none' }}>
            <NotasTab textura={textura} notaPendente={notaPendente} onNotaAberta={() => setNotaPendente(null)} onNotaAtiva={setNotaAtivaId} />
          </div>
          {aba === 'grafo'  && <GraphTab dark={dark} />}
          {aba === 'config' && <ConfigTab dark={dark} toggleTheme={toggleTheme} textura={textura} setTexturaTo={setTexturaTo} />}
        </div>

        {/* Terminal panel */}
        {terminalOpen && vaultPath && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              style={{
                height: '4px',
                background: '#2a2a2a',
                cursor: 'row-resize',
                flexShrink: 0,
                borderTop: '1px solid #333',
              }}
            />
            {/* Terminal container */}
            <div style={{ height: terminalHeight, flexShrink: 0, overflow: 'hidden' }}>
              <TerminalPane key={terminalKey} vaultPath={vaultPath} onClose={() => setTerminalOpen(false)} />
            </div>
          </>
        )}
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
