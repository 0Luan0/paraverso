import { useState, useEffect } from 'react'
import { getTemplatesVault, lerTemplateVault } from '../../lib/vaultFs'
import { resolverVariaveis } from '../../lib/templateUtils'
import { useVault } from '../../contexts/VaultContext'

export function TemplateModal({ onInsert, onClose, titulo }) {
  const { vaultPath } = useVault()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState(null)

  useEffect(() => {
    if (!vaultPath) return
    getTemplatesVault(vaultPath)
      .then(list => {
        setTemplates(list)
        setHover(list[0]?.filename ?? null)
      })
      .finally(() => setLoading(false))
  }, [vaultPath])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter' && hover) { aplicar(hover); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = templates.findIndex(t => t.filename === hover)
        const next = e.key === 'ArrowDown'
          ? Math.min(idx + 1, templates.length - 1)
          : Math.max(idx - 1, 0)
        setHover(templates[next]?.filename ?? null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hover, templates])

  async function aplicar(filename) {
    try {
      const markdown = await lerTemplateVault(vaultPath, filename)
      const resolvido = resolverVariaveis(markdown, { titulo: titulo || '' })
      onInsert(resolvido)
    } catch (e) {
      console.error('[TemplateModal] erro ao ler template:', e)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bdr dark:border-bdr-dark">
          <span className="text-sm font-medium text-ink dark:text-ink-dark">
            Inserir template
          </span>
          <div className="flex items-center gap-2">
            <kbd className="text-[10px] text-ink-3 dark:text-ink-dark3 bg-bg dark:bg-bg-dark px-1.5 py-0.5 rounded border border-bdr dark:border-bdr-dark">↑↓</kbd>
            <kbd className="text-[10px] text-ink-3 dark:text-ink-dark3 bg-bg dark:bg-bg-dark px-1.5 py-0.5 rounded border border-bdr dark:border-bdr-dark">↵ inserir</kbd>
            <button onClick={onClose} className="text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark text-xs ml-1">✕</button>
          </div>
        </div>

        <div className="py-1 max-h-72 overflow-auto">
          {loading && (
            <p className="text-xs text-ink-3 dark:text-ink-dark3 px-4 py-3">Carregando…</p>
          )}
          {!loading && templates.length === 0 && (
            <div className="px-4 py-6 text-center space-y-1">
              <p className="text-sm text-ink-3 dark:text-ink-dark3">Nenhum template encontrado.</p>
              <p className="text-xs text-ink-3/60 dark:text-ink-dark3/60">
                Crie arquivos .md na pasta de templates do vault.
              </p>
            </div>
          )}
          {templates.map(t => (
            <button
              key={t.filename}
              onClick={() => aplicar(t.filename)}
              onMouseEnter={() => setHover(t.filename)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                hover === t.filename
                  ? 'bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark'
                  : 'text-ink dark:text-ink-dark hover:bg-bg dark:hover:bg-bg-dark'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 opacity-60">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span className="text-sm">{t.titulo}</span>
            </button>
          ))}
        </div>

        {!loading && templates.length > 0 && (
          <div className="px-4 py-2 border-t border-bdr-2 dark:border-bdr-dark2">
            <p className="text-[10px] text-ink-3/60 dark:text-ink-dark3/60">
              Arquivos .md na pasta de templates do vault
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
