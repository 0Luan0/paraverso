import { useState, useRef, useEffect } from 'react'
import { Modal, ModalHeader, ModalBody, ModalFooter } from './Modal'

/**
 * Generic input modal — rename, new folder, new notebook, etc.
 * Auto-focus and select on open. Enter confirms, Escape cancels.
 */
export function InputModal({ title, placeholder, defaultValue = '', onConfirm, onCancel }) {
  const [val, setVal] = useState(defaultValue)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const confirm = () => {
    const v = val.trim()
    if (v) onConfirm(v)
  }

  return (
    <Modal open={true} onClose={onCancel} size="sm">
      <ModalHeader title={title} />
      <ModalBody>
        <input
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
          }}
          placeholder={placeholder}
          className="w-full text-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-soft px-3 py-2 text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
        />
      </ModalBody>
      <ModalFooter>
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cancelar
        </button>
        <button onClick={confirm} className="btn-primary text-xs py-1.5">
          Confirmar
        </button>
      </ModalFooter>
    </Modal>
  )
}

/**
 * Destructive confirmation modal — delete folder, clear data, etc.
 */
export function ConfirmModal({ message, confirmLabel = 'Apagar', onConfirm, onCancel }) {
  return (
    <Modal open={true} onClose={onCancel} size="sm">
      <ModalBody className="py-5">
        <p className="text-sm text-ink dark:text-ink-dark leading-relaxed">{message}</p>
      </ModalBody>
      <ModalFooter>
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium bg-red-600/90 text-white hover:bg-red-600 active:scale-[0.97] transition-all"
        >
          {confirmLabel}
        </button>
      </ModalFooter>
    </Modal>
  )
}

/**
 * Folder picker — lists top-level notebooks + root as move targets.
 * Used by "Move to..." in the folder context menu.
 */
export function FolderPicker({ cadernos, excludePath, onConfirm, onCancel }) {
  const opcoes = [
    { label: '(Raiz do vault)', value: '' },
    ...cadernos
      .filter((c) => c.nome !== excludePath && !c.nome.startsWith(excludePath + '/'))
      .map((c) => ({ label: c.nome, value: c.nome })),
  ]

  return (
    <Modal open={true} onClose={onCancel} size="md">
      <ModalHeader title="Mover para onde?" />
      <ModalBody className="py-3">
        {opcoes.length === 0 ? (
          <p className="text-xs text-ink-3 dark:text-ink-dark3 text-center py-4">
            Nenhum destino disponível
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {opcoes.map((op) => (
              <button
                key={op.value || '__root__'}
                onClick={() => onConfirm(op.value)}
                className="text-left px-3 py-2 rounded-soft text-sm text-ink dark:text-ink-dark hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors"
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <button onClick={onCancel} className="btn-ghost text-xs">
          Cancelar
        </button>
      </ModalFooter>
    </Modal>
  )
}
