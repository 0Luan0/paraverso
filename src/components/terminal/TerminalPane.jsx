import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { isCommand, parseCommand, resolveCommand, listCommands, isBuiltinCommand } from '../../services/commandParser'

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
  const inputBufferRef = useRef('')

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const allCommandsRef = useRef([])

  // Load available commands once
  useEffect(() => {
    if (!vaultPath) return
    listCommands(vaultPath).then(cmds => { allCommandsRef.current = cmds })
  }, [vaultPath])

  const updateSuggestions = useCallback((buffer) => {
    if (!buffer.startsWith('\\') || buffer.includes(' ')) {
      setSuggestions([])
      return
    }
    const partial = buffer.slice(1).toLowerCase()
    const filtered = allCommandsRef.current.filter(c => c.toLowerCase().startsWith(partial))
    setSuggestions(filtered)
    setSelectedIdx(0)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !vaultPath) return

    let cancelled = false

    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: false,
      scrollOnUserInput: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    termRef.current = term
    fitAddonRef.current = fitAddon

    term.open(containerRef.current)

    // Intercept Cmd+V / Cmd+C to prevent unintended paste behavior
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.metaKey && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (text) window.electron.terminal.write(text)
        })
        return false
      }
      if (e.type === 'keydown' && e.metaKey && e.key === 'c') {
        const selection = term.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection)
          return false
        }
        return true // no selection → let SIGINT through
      }
      return true
    })

    // Block native browser paste on the terminal container
    const blockPaste = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const text = e.clipboardData?.getData('text')
      if (text) window.electron.terminal.write(text)
    }
    containerRef.current.addEventListener('paste', blockPaste)

    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    // Start pty
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

    // Receive data from pty → xterm
    window.electron.terminal.onData((data) => {
      if (!cancelled) term.write(data)
    })

    // Handle command execution
    const handleCommand = async (rawInput) => {
      const { command, args } = parseCommand(rawInput)

      // Built-in: \task — add to the same daily note the sidebar button uses
      if (command === 'task') {
        if (!args || args.trim() === '') {
          term.writeln('\r\n\x1b[33m⚠ Use: \\task [descrição da tarefa]\x1b[0m')
          return
        }
        try {
          // Same title format as criarNotaDiaria() in NotasTab.jsx
          const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
          const now = new Date()
          const titulo = `${now.getDate()} ${MESES[now.getMonth()]} ${now.getFullYear()}`

          // Same folder as the sidebar button
          const journalFolder = await window.electron.getConfig('journalCaderno') || 'Journal'

          // Dispatch journal event to ensure the note exists (creates if needed)
          window.dispatchEvent(new CustomEvent('paraverso:journal'))

          // Wait for the note to be created/opened, then append task
          await new Promise(r => setTimeout(r, 600))

          const notePath = await window.electron.joinPath(vaultPath, journalFolder, `${titulo}.md`)
          const result = await window.electron.vault.addTask(notePath, args.trim())

          if (result.success) {
            term.writeln(`\r\n\x1b[32m✓ Task adicionada em ${titulo}\x1b[0m`)
          } else {
            term.writeln(`\r\n\x1b[33m⚠ ${result.error}\x1b[0m`)
          }
        } catch (err) {
          term.writeln(`\r\n\x1b[31m✕ Erro: ${err.message}\x1b[0m`)
        }
        return
      }

      // Built-in: \pessoa, \interesses, \estilo — scan vault and update one context file
      const scanTargets = { pessoa: 'pessoa.md', interesses: 'interesses.md', estilo: 'estilo.md' }
      if (scanTargets[command]) {
        const targetFile = scanTargets[command]
        term.writeln(`\r\n\x1b[35m⟳ Varrendo vault para atualizar ${targetFile}...\x1b[0m`)

        // Load the template for this command
        const machinePath = await window.electron.joinPath(vaultPath, '_machine')
        const templatePath = await window.electron.joinPath(machinePath, 'templates', `${command}.md`)
        let templateContent = ''
        try { templateContent = await window.electron.machineContext.readContext(templatePath) } catch {}

        if (!templateContent || typeof templateContent !== 'string' || templateContent.error) {
          term.writeln(`\x1b[33m⚠ Template \\${command} não encontrado em _machine/templates/\x1b[0m`)
          return
        }

        const notes = await window.electron.vault.scanHuman(vaultPath)
        if (!notes || notes.length === 0) {
          term.writeln('\x1b[33m⚠ Nenhuma nota encontrada no vault humano.\x1b[0m')
          return
        }

        term.writeln(`\x1b[35m✓ ${notes.length} notas encontradas. Analisando...\x1b[0m`)

        try {
          const result = await window.electron.vault.runScan(vaultPath, notes, targetFile, templateContent)
          if (!result.success) {
            term.writeln('\r\n\x1b[33m⚠ Análise encerrou com erros.\x1b[0m')
          }
        } catch (err) {
          term.writeln(`\r\n\x1b[31m✕ Erro: ${err.message}\x1b[0m`)
        }
        return
      }

      // Template-based commands
      const { prompt, error } = await resolveCommand(rawInput, vaultPath)

      if (error) {
        term.writeln(`\r\n\x1b[33m⚠ ${error}\x1b[0m`)
        return
      }

      const escaped = prompt.replace(/\n/g, '\\n')
      window.electron.terminal.write(escaped + '\r')
    }

    // User input → intercept \ commands
    const inputDisposable = term.onData((data) => {
      const buf = inputBufferRef.current

      // Escape — clear autocomplete
      if (data === '\x1b') {
        setSuggestions([])
        inputBufferRef.current = ''
        window.electron.terminal.write(data)
        return
      }

      // Tab — accept autocomplete suggestion
      if (data === '\t' && suggestions.length > 0) {
        const chosen = suggestions[selectedIdx] || suggestions[0]
        // Erase current partial from terminal display
        const partial = buf.slice(1)
        const eraseLen = partial.length
        if (eraseLen > 0) {
          window.electron.terminal.write('\x7f'.repeat(eraseLen))
        }
        // Write completed command
        const completion = chosen.slice(0) + ' '
        inputBufferRef.current = '\\' + chosen + ' '
        // Write to terminal display (not pty — we handle display locally for \ commands)
        term.write(completion.slice(partial.length))
        setSuggestions([])
        return
      }

      // Arrow up/down for autocomplete navigation
      if (suggestions.length > 0) {
        if (data === '\x1b[A') { // up
          setSelectedIdx(i => Math.max(0, i - 1))
          return
        }
        if (data === '\x1b[B') { // down
          setSelectedIdx(i => Math.min(suggestions.length - 1, i + 1))
          return
        }
      }

      // Backspace
      if (data === '\x7f') {
        inputBufferRef.current = buf.slice(0, -1)
        updateSuggestions(inputBufferRef.current)
        window.electron.terminal.write(data)
        return
      }

      // Enter
      if (data === '\r') {
        const currentBuf = inputBufferRef.current.trim()
        setSuggestions([])

        if (isCommand(currentBuf)) {
          inputBufferRef.current = ''
          term.writeln('') // visual newline
          handleCommand(currentBuf)
          return
        }

        inputBufferRef.current = ''
        window.electron.terminal.write(data)
        return
      }

      // Regular character — accumulate in buffer
      // Only accumulate printable characters (not escape sequences)
      if (data.length === 1 && data.charCodeAt(0) >= 32) {
        inputBufferRef.current = buf + data
        updateSuggestions(inputBufferRef.current)
      } else if (data.length > 1 && data.charCodeAt(0) !== 27) {
        // Multi-byte UTF-8 character (emoji, accented chars)
        inputBufferRef.current = buf + data
        updateSuggestions(inputBufferRef.current)
      }

      window.electron.terminal.write(data)
    })

    // Handle terminal exit
    window.electron.terminal.onExit((code) => {
      if (!cancelled) {
        term.writeln('')
        term.writeln(`\x1b[33m[Terminal encerrado com código ${code}]\x1b[0m`)
      }
    })

    // ResizeObserver
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

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      inputDisposable.dispose()
      if (containerRef.current) containerRef.current.removeEventListener('paste', blockPaste)
      window.electron.terminal.offData()
      window.electron.terminal.offExit()
      window.electron.terminal.kill()
      term.dispose()
      termRef.current = null
      fitAddonRef.current = null
    }
  }, [vaultPath]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#1a1a1a', position: 'relative' }}>
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
          <span style={{ marginLeft: 12, color: '#555' }}>
            \ para comandos
          </span>
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

      {/* Autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 12,
          marginBottom: -30,
          background: '#2a2a2a',
          border: '1px solid #444',
          borderRadius: 6,
          padding: '4px 0',
          zIndex: 100,
          minWidth: 180,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((cmd, i) => (
            <div
              key={cmd}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontFamily: 'Menlo, Monaco, monospace',
                color: i === selectedIdx ? '#e4e4e4' : '#888',
                background: i === selectedIdx ? '#3a3a3a' : 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setSelectedIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                const chosen = cmd + ' '
                const partial = inputBufferRef.current.slice(1)
                inputBufferRef.current = '\\' + chosen
                // Write remaining chars to terminal
                if (termRef.current) {
                  const remaining = chosen.slice(partial.length)
                  termRef.current.write(remaining)
                }
                setSuggestions([])
              }}
            >
              \{cmd}
            </div>
          ))}
        </div>
      )}

      {/* Terminal */}
      <div
        ref={containerRef}
        style={{ flex: 1, padding: '4px 0 0 4px', overflow: 'hidden' }}
      />
    </div>
  )
}
