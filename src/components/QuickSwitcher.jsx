import { useState, useEffect, useRef } from 'react'
import { getTodasNotasMetadata } from '../db/index'

/**
 * QuickSwitcher — abre com Cmd+O
 * Filtra todas as notas em tempo real, navega com ↑↓ e abre com Enter.
 */
export function QuickSwitcher({ onClose, onAbrirNota }) {
  const [query, setQuery]         = useState('')
  const [todasNotas, setTodas]    = useState([])
  const [filtradas, setFiltradas] = useState([])
  const [cursor, setCursor]       = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)
  const itemRefs  = useRef([])

  // Carrega apenas metadados ao abrir — sem parsear conteúdo, muito mais rápido
  useEffect(() => {
    getTodasNotasMetadata()
      .then(lista => {
        // Ordena por mais recente
        const ordenadas = [...lista].sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
        setTodas(ordenadas)
        setFiltradas(ordenadas.slice(0, 25))
      })
      .catch(() => {})

    // Foca o input
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Filtra ao digitar
  // Usa String() explícito — parseSimpleYaml pode retornar numbers para campos como
  // "titulo: 2024" ou "id: 123", e number.toLowerCase() lançaria TypeError → tela preta.
  useEffect(() => {
    try {
      const q = query.trim().toLowerCase()
      if (!q) {
        setFiltradas(todasNotas.slice(0, 25))
      } else {
        setFiltradas(
          todasNotas
            .filter(n => {
              const titulo  = String(n.titulo  ?? '').toLowerCase()
              const caderno = String(n.caderno ?? '').toLowerCase()
              return titulo.includes(q) || caderno.includes(q)
            })
            .slice(0, 25)
        )
      }
      setCursor(0)
    } catch (err) {
      console.error('QuickSwitcher filter error:', err)
      setFiltradas([])
    }
  }, [query, todasNotas])

  // Scroll do item selecionado para a vista
  useEffect(() => {
    itemRefs.current[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  function handleKey(e) {
    if (e.key === 'Escape')     { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setCursor(c => Math.min(c + 1, filtradas.length - 1)); return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradas[cursor]) {
        onAbrirNota(filtradas[cursor])
      } else if (query.trim()) {
        // Nota não existe — criar nova com esse título
        onAbrirNota({ titulo: query.trim(), _criar: true })
      }
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 bg-surface dark:bg-surface-dark rounded-xl border border-bdr dark:border-bdr-dark shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bdr-2 dark:border-bdr-dark2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-3 dark:text-ink-dark3 flex-shrink-0">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Abrir nota..."
            className="flex-1 bg-transparent text-sm text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-bg-2 dark:bg-bg-dark2 text-ink-3 dark:text-ink-dark3 border border-bdr dark:border-bdr-dark font-mono">
            esc
          </kbd>
        </div>

        {/* Lista */}
        <div ref={listRef} className="max-h-[340px] overflow-auto py-1">
          {filtradas.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-ink-3 dark:text-ink-dark3">
                {query ? 'Nenhuma nota encontrada' : 'Vault vazio'}
              </p>
              {query.trim() && (
                <p className="text-xs text-accent dark:text-accent-dark mt-2">
                  ↵ Criar "<span className="font-medium">{query.trim()}</span>"
                </p>
              )}
            </div>
          ) : (
            filtradas.map((nota, i) => (
              <button
                key={nota.id}
                ref={el => (itemRefs.current[i] = el)}
                onClick={() => { onAbrirNota(nota); onClose() }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === cursor
                    ? 'bg-accent/10 dark:bg-accent-dark/10'
                    : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
                }`}
              >
                {/* Ícone nota */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={i === cursor ? 'text-accent dark:text-accent-dark flex-shrink-0' : 'text-ink-3 dark:text-ink-dark3 flex-shrink-0'}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>

                {/* Título */}
                <span className="flex-1 text-sm text-ink dark:text-ink-dark truncate">
                  {nota.titulo || 'Sem título'}
                </span>

                {/* Caderno badge */}
                <span className="text-xs text-ink-3 dark:text-ink-dark3 flex-shrink-0 bg-bg-2 dark:bg-bg-dark2 px-2 py-0.5 rounded-full">
                  {nota.caderno}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-bdr-2 dark:border-bdr-dark2 px-4 py-2 flex items-center gap-4">
          <span className="text-[11px] text-ink-3/50 dark:text-ink-dark3/50">↑↓ navegar</span>
          <span className="text-[11px] text-ink-3/50 dark:text-ink-dark3/50">↵ {filtradas.length === 0 && query.trim() ? 'criar' : 'abrir'}</span>
          <span className="text-[11px] text-ink-3/50 dark:text-ink-dark3/50">esc fechar</span>
          {filtradas.length > 0 && (
            <span className="text-[11px] text-ink-3/40 dark:text-ink-dark3/40 ml-auto">
              {filtradas.length} nota{filtradas.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
