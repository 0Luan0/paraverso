import { useState, useEffect, useRef } from 'react'
import { NOMES_MES } from '../../lib/mesUtils'

export function DiaModal({ dia, mesObj, onClose, onSave }) {
  const [nota, setNota] = useState(dia.nota || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // fechar com Esc
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  function salvar() {
    onSave(dia.n, { nota })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) salvar() }}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-bdr dark:border-bdr-dark w-full max-w-xl mx-4 shadow-xl flex flex-col max-h-[80vh]">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-bdr dark:border-bdr-dark">
          <div>
            <span className="font-serif text-lg font-medium text-ink dark:text-ink-dark">
              {dia.n} de {NOMES_MES[mesObj.mes - 1]}
            </span>
            <span className="text-xs text-ink-3 dark:text-ink-dark3 ml-2">{dia.letraDia}</span>
          </div>
          <button
            onClick={salvar}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          >
            Salvar ↵
          </button>
        </div>

        {/* memo resumo (read-only aqui) */}
        {dia.memo && (
          <div className="px-5 py-2 border-b border-bdr-2 dark:border-bdr-dark2 text-sm text-ink-2 dark:text-ink-dark2 italic">
            "{dia.memo}"
          </div>
        )}

        {/* nota expandida */}
        <textarea
          ref={textareaRef}
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Escreva mais sobre esse dia..."
          className="flex-1 resize-none bg-transparent px-5 py-4 text-sm text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none leading-relaxed min-h-[200px]"
        />

        {/* footer */}
        <div className="px-5 py-2 border-t border-bdr-2 dark:border-bdr-dark2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            className="text-xs bg-accent dark:bg-accent-dark text-white rounded px-3 py-1 hover:bg-accent-2 transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
