import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

/**
 * TerminalPane — terminal puro, igual ao terminal do sistema.
 * Sem command bar, sem \comandos, sem automacoes.
 * O usuario digita o que quiser (claude, git, npm, etc).
 */
export function TerminalPane({ vaultPath, onClose }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !window.electron?.terminal) return

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: 'SF Mono, Menlo, Monaco, Consolas, monospace',
      lineHeight: 1.4,
      theme: {
        background: '#1a1a1a',
        foreground: '#c8c4be',
        cursor: '#c8c4be',
        selectionBackground: 'rgba(255,255,255,0.15)',
        black: '#1a1a1a',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#c8c4be',
      },
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fitAddon

    // Fit to container
    requestAnimationFrame(() => {
      try { fitAddon.fit() } catch { /* container may have unmounted before rAF fired */ }
    })

    // Start PTY
    window.electron.terminal.start(vaultPath)

    // PTY data → xterm
    window.electron.terminal.onData((data) => {
      term.write(data)
    })

    // PTY exit
    window.electron.terminal.onExit((code) => {
      term.writeln(`\r\n\x1b[90m[processo encerrado com código ${code}]\x1b[0m`)
    })

    // xterm input → PTY
    term.onData((data) => {
      window.electron.terminal.write(data)
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        window.electron.terminal.resize(term.cols, term.rows)
      } catch {
        // ResizeObserver can fire during terminal disposal or before PTY is ready.
        // Both paths are harmless — next resize will succeed.
      }
    })
    resizeObserver.observe(containerRef.current)

    // Keyboard shortcuts
    const handleKey = (e) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+V — paste
      if (mod && e.key === 'v') {
        e.preventDefault()
        navigator.clipboard.readText().then(text => {
          if (text) window.electron.terminal.write(text)
        })
        return
      }

      // Cmd+C — copy selection or SIGINT
      if (mod && e.key === 'c') {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
        } else {
          window.electron.terminal.write('\x03')
        }
        e.preventDefault()
        return
      }

      // Cmd+A — select all
      if (mod && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        term.selectAll()
        return
      }
    }

    containerRef.current.addEventListener('keydown', handleKey)
    const container = containerRef.current

    return () => {
      container.removeEventListener('keydown', handleKey)
      resizeObserver.disconnect()
      window.electron.terminal.offData()
      window.electron.terminal.offExit()
      window.electron.terminal.kill()
      term.dispose()
    }
  }, [vaultPath])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 10px',
        borderBottom: '1px solid #2a2a2a',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '11px', color: '#666', fontFamily: 'SF Mono, Menlo, monospace' }}>
          terminal
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 4px',
            lineHeight: 1,
          }}
          title="Fechar terminal"
        >
          ×
        </button>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        style={{ flex: 1, padding: '4px 0 0 4px', overflow: 'hidden' }}
      />
    </div>
  )
}
