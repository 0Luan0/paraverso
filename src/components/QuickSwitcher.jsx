import { useState, useEffect, useRef } from 'react'
import { getTodasNotasMetadata } from '../db/index'

const MACHINE_COLOR = '#9d8ff5'

/**
 * QuickSwitcher — abre com Cmd+O
 * Lista unificada: notas humanas + notas da máquina com badge visual.
 * Humanas primeiro, máquina depois. Filtra em tempo real.
 */
export function QuickSwitcher({ onClose, onAbrirNota, vaultPath }) {
  const [query, setQuery]         = useState('')
  const [todasNotas, setTodas]    = useState([])
  const [filtradas, setFiltradas] = useState([])
  const [cursor, setCursor]       = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)
  const itemRefs  = useRef([])

  // Load both hemispheres on mount
  useEffect(() => {
    async function carregar() {
      let humanas = []
      try {
        const lista = await getTodasNotasMetadata()
        humanas = lista.map(n => ({ ...n, hemisphere: 'human' }))
      } catch {}

      let maquina = []
      try {
        const files = await window.electron?.machineContext?.listFiles(vaultPath) || []
        maquina = files.map(fp => {
          const filename = fp.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')
          const rel = fp.replace(vaultPath, '').replace(/^[/\\]/, '').replace(/\.md$/i, '').normalize('NFC')
          return {
            id: 'machine:' + rel,
            titulo: filename,
            caderno: '_machine',
            tags: [],
            editadaEm: 0,
            _filename: filename,
            _filePath: fp,
            hemisphere: 'machine',
            relativePath: rel,
          }
        })
      } catch {}

      setTodas([
        ...humanas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0)),
        ...maquina,
      ])
    }
    carregar()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [vaultPath])

  // Filter on query change
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
              const rel     = String(n.relativePath ?? '').toLowerCase()
              return titulo.includes(q) || caderno.includes(q) || rel.includes(q)
            })
            .slice(0, 25)
        )
      }
      setCursor(0)
    } catch {
      setFiltradas([])
    }
  }, [query, todasNotas])

  // Scroll selected into view
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
                <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-2">
                  ↵ Criar "<span className="font-medium">{query.trim()}</span>"
                </p>
              )}
            </div>
          ) : (
            filtradas.map((nota, i) => {
              const isMachine = nota.hemisphere === 'machine'
              return (
                <button
                  key={nota.id}
                  ref={el => (itemRefs.current[i] = el)}
                  onClick={() => { onAbrirNota(nota); onClose() }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === cursor ? 'bg-white/5' : 'hover:bg-white/3'
                  }`}
                >
                  {/* Dot — roxo para máquina */}
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0, opacity: 0.6,
                    background: isMachine ? MACHINE_COLOR : 'currentColor',
                  }} />

                  {/* Título */}
                  <span className="flex-1 text-sm truncate" style={isMachine ? { color: MACHINE_COLOR } : undefined}>
                    {nota.titulo || 'Sem título'}
                  </span>

                  {/* Badge */}
                  {isMachine ? (
                    <span style={{ fontSize: 10, color: MACHINE_COLOR, background: '#1e1a2e', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                      {nota.relativePath?.split('/').slice(0, -1).pop() || 'máquina'}
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3 dark:text-ink-dark3 flex-shrink-0 bg-bg-2 dark:bg-bg-dark2 px-2 py-0.5 rounded-full">
                      {nota.caderno}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
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
