import { useState, useEffect, useRef } from 'react'
import { NOMES_MES } from '../../lib/mesUtils'

function ResumoModal({ mesObj, onClose, onSave }) {
  const [texto, setTexto] = useState(mesObj.resumo || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
    // posiciona cursor no final
    const len = textareaRef.current?.value.length || 0
    textareaRef.current?.setSelectionRange(len, len)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { onSave(texto); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onSave, texto])

  function salvar() {
    onSave(texto)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) salvar() }}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-bdr dark:border-bdr-dark w-full max-w-2xl mx-4 shadow-xl flex flex-col max-h-[80vh]">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-bdr dark:border-bdr-dark">
          <span className="font-serif text-lg font-medium text-ink dark:text-ink-dark">
            Resumo de {NOMES_MES[mesObj.mes - 1]}
          </span>
          <button
            onClick={salvar}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          >
            Salvar ↵
          </button>
        </div>

        {/* área de texto */}
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="O que aconteceu? O que quer guardar deste mês?"
          className="flex-1 resize-none bg-transparent px-5 py-4 text-sm text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none leading-relaxed min-h-[300px]"
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

export function ResumoMes({ mesObj, onUpdate }) {
  const [modalAberto, setModalAberto] = useState(false)

  function salvarResumo(texto) {
    onUpdate({ ...mesObj, resumo: texto })
  }

  const preview = mesObj.resumo?.trim()

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-3 dark:text-ink-dark3 uppercase tracking-wider">
            Resumo do mês
          </p>
          <button
            onClick={() => setModalAberto(true)}
            className="text-xs text-accent dark:text-accent-dark hover:underline transition-colors"
          >
            {preview ? 'Editar' : '+ Escrever'}
          </button>
        </div>

        {/* preview do resumo */}
        <div
          onClick={() => setModalAberto(true)}
          className="text-sm text-ink-2 dark:text-ink-dark2 leading-relaxed cursor-pointer rounded-lg p-3 bg-bg-2 dark:bg-bg-dark2 border border-bdr-2 dark:border-bdr-dark2 hover:border-bdr dark:hover:border-bdr-dark transition-colors min-h-[64px]"
        >
          {preview
            ? <span className="line-clamp-3">{preview}</span>
            : <span className="text-ink-3/60 dark:text-ink-dark3/60 italic text-xs">O que aconteceu? O que quer guardar deste mês?</span>
          }
        </div>
      </div>

      {modalAberto && (
        <ResumoModal
          mesObj={mesObj}
          onClose={() => setModalAberto(false)}
          onSave={salvarResumo}
        />
      )}
    </>
  )
}
