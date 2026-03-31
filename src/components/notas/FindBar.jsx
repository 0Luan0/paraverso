import { useEffect, useRef, useState } from 'react'

/**
 * FindBar — barra de busca flutuante dentro do editor (Cmd+F)
 * Usa a API nativa do Electron findInPage para highlight real.
 */
export function FindBar({ onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    if (query.trim()) {
      window.electron?.findInPage(query)
    } else {
      window.electron?.stopFind()
    }
  }, [query])

  function handleKey(e) {
    if (e.key === 'Escape') {
      window.electron?.stopFind()
      onClose()
    }
    if (e.key === 'Enter') {
      // Próxima ocorrência
      if (query.trim()) window.electron?.findInPage(query, { findNext: true, forward: !e.shiftKey })
    }
  }

  function fechar() {
    window.electron?.stopFind()
    onClose()
  }

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-bg-2 dark:bg-bg-dark2 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 dark:text-ink-dark3">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Buscar no documento..."
        className="flex-1 bg-transparent text-xs text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none"
      />
      <span className="text-[10px] text-ink-3/50 dark:text-ink-dark3/50">↵ próxima · ⇧↵ anterior · esc fechar</span>
      <button
        onClick={fechar}
        className="text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors ml-1"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
