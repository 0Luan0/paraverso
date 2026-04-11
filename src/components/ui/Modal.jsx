import { useEffect } from 'react'

/**
 * Modal — base component for all app modals.
 *
 * Handles: backdrop, escape key, click-outside, entry animation.
 * Compose with ModalHeader / ModalBody / ModalFooter for standard layout,
 * or put arbitrary children inside for a custom look.
 *
 * <Modal open={open} onClose={close} size="sm">
 *   <ModalHeader title="..." onClose={close} />
 *   <ModalBody>...</ModalBody>
 *   <ModalFooter>...</ModalFooter>
 * </Modal>
 */
export function Modal({
  open,
  onClose,
  size = 'sm',
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, closeOnEscape])

  if (!open) return null

  const widths = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 modal-backdrop"
      onClick={() => closeOnBackdrop && onClose?.()}
    >
      <div
        className={`${widths[size] || widths.sm} w-full mx-4 bg-surface dark:bg-surface-dark2 border border-bdr dark:border-bdr-dark rounded-base shadow-2xl modal-panel flex flex-col max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/** Standard header — title on the left, optional action or close button on the right. */
export function ModalHeader({ title, subtitle, action, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-bdr dark:border-bdr-dark flex-shrink-0">
      <div className="min-w-0 flex-1">
        {typeof title === 'string'
          ? <h3 className="text-sm font-medium text-ink dark:text-ink-dark truncate">{title}</h3>
          : title}
        {subtitle && <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">{subtitle}</p>}
      </div>
      {action ? action : (onClose && (
        <button
          onClick={onClose}
          className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors px-2 py-1"
          aria-label="Fechar"
        >
          ✕
        </button>
      ))}
    </div>
  )
}

/** Scrollable body region. */
export function ModalBody({ children, className = '' }) {
  return (
    <div className={`flex-1 overflow-auto px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}

/** Footer with right-aligned actions. */
export function ModalFooter({ children, className = '' }) {
  return (
    <div className={`px-5 py-3 border-t border-bdr-2 dark:border-bdr-dark2 flex justify-end items-center gap-2 flex-shrink-0 ${className}`}>
      {children}
    </div>
  )
}
