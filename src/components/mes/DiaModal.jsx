import { useState, useEffect, useRef } from 'react'
import { NOMES_MES } from '../../lib/mesUtils'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '../ui/Modal'

export function DiaModal({ dia, mesObj, onClose, onSave }) {
  const [nota, setNota] = useState(dia.nota || '')
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function salvar() {
    onSave(dia.n, { nota })
    onClose()
  }

  const headerTitle = (
    <div className="flex items-baseline gap-2">
      <span className="font-serif text-heading font-medium text-ink dark:text-ink-dark">
        {dia.n} de {NOMES_MES[mesObj.mes - 1]}
      </span>
      <span className="text-xs text-ink-3 dark:text-ink-dark3">{dia.letraDia}</span>
    </div>
  )

  return (
    <Modal open={true} onClose={salvar} size="xl">
      <ModalHeader
        title={headerTitle}
        action={
          <button
            onClick={salvar}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors px-2 py-1"
          >
            Salvar ↵
          </button>
        }
      />

      {/* memo resumo (read-only) */}
      {dia.memo && (
        <div className="px-5 py-2 border-b border-bdr-2 dark:border-bdr-dark2 text-sm text-ink-2 dark:text-ink-dark2 italic flex-shrink-0">
          "{dia.memo}"
        </div>
      )}

      {/* nota expandida */}
      <textarea
        ref={textareaRef}
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Escreva mais sobre esse dia..."
        className="flex-1 resize-none bg-transparent px-5 py-4 text-sm text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none leading-relaxed min-h-[200px]"
      />

      <ModalFooter>
        <button onClick={onClose} className="btn-ghost text-xs">
          Cancelar
        </button>
        <button onClick={salvar} className="btn-primary text-xs py-1.5">
          Salvar
        </button>
      </ModalFooter>
    </Modal>
  )
}
