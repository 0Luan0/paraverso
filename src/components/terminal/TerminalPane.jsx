import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const TERM_THEME = {
  background: '#1a1a1a',
  foreground: '#e4e4e4',
  cursor: '#ffffff',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#ffffff30',
  black: '#1a1a1a',
  brightBlack: '#4a4a4a',
  white: '#e4e4e4',
  brightWhite: '#ffffff',
  blue: '#4d9ef7',
  brightBlue: '#6db3ff',
  green: '#4ec9b0',
  brightGreen: '#73e0c9',
  yellow: '#dcdcaa',
  brightYellow: '#f0f0c0',
  red: '#f44747',
  brightRed: '#ff6b6b',
  cyan: '#4ec9b0',
  brightCyan: '#73e0c9',
  magenta: '#c678dd',
  brightMagenta: '#e0a0f0',
}

export function TerminalPane({ vaultPath, onClose }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || !vaultPath) return

    // Guard against React StrictMode double-mount
    let cancelled = false

    // Create terminal instance
    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Mount terminal to DOM
    term.open(containerRef.current)

    // Initial fit
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    // Start pty process via IPC (with StrictMode guard)
    const startPty = async () => {
      if (cancelled) return
      try {
        await window.electron.terminal.start(vaultPath)
      } catch (err) {
        if (!cancelled) {
          term.writeln(`\x1b[31mErro ao iniciar terminal: ${err.message}\x1b[0m`)
        }
      }
    }
    startPty()

    // Receive data from pty → write to xterm
    window.electron.terminal.onData((data) => {
      if (!cancelled) term.write(data)
    })

    // User types in xterm → send to pty
    const inputDisposable = term.onData((data) => {
      window.electron.terminal.write(data)
    })

    // Handle terminal exit
    window.electron.terminal.onExit((code) => {
      if (!cancelled) {
        term.writeln('')
        term.writeln(`\x1b[33m[Terminal encerrado com código ${code}]\x1b[0m`)
      }
    })

    // ResizeObserver for fit
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && containerRef.current) {
          try {
            fitAddonRef.current.fit()
            const dims = fitAddonRef.current.proposeDimensions()
            if (dims) {
              window.electron.terminal.resize(dims.cols, dims.rows)
            }
          } catch {}
        }
      })
    })
    resizeObserver.observe(containerRef.current)

    // Cleanup — runs on StrictMode remount AND real unmount
    return () => {
      cancelled = true
      resizeObserver.disconnect()
      inputDisposable.dispose()
      window.electron.terminal.offData()
      window.electron.terminal.offExit()
      window.electron.terminal.kill()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [vaultPath])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 12px',
        borderBottom: '1px solid #333',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '12px', color: '#888', fontFamily: 'Menlo, Monaco, monospace' }}>
          Terminal — Claude Code
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            padding: '0 4px',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e4e4e4' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#888' }}
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
