import { useEffect, useRef } from 'react'

/**
 * Context menu genérico posicionado por coordenadas (x, y).
 * Fecha em: click fora, Escape, scroll, wheel.
 *
 * Props:
 * - x, y: posição da origem (top-left do menu)
 * - items: array de { label, icon?, onClick, danger?, separator? }
 * - onClose: chamado quando o menu deve fechar
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  // Ajusta posição se o menu sair da tela
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let nx = x
    let ny = y
    if (rect.right > vw - 4) nx = Math.max(4, vw - rect.width - 4)
    if (rect.bottom > vh - 4) ny = Math.max(4, vh - rect.height - 4)
    if (nx !== x || ny !== y) {
      el.style.left = `${nx}px`
      el.style.top = `${ny}px`
    }
  }, [x, y])

  // Fecha em click fora, Escape, scroll
  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    function onScroll() {
      onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: '#1e1e2e',
        border: '0.5px solid #3a3555',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        padding: '4px 0',
        minWidth: 180,
        zIndex: 2000,
        fontSize: 13,
      }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} style={{ height: 1, background: '#2a2a3a', margin: '4px 0' }} />
        }
        return (
          <button
            key={item.label}
            onClick={() => {
              onClose()
              // Roda a ação no próximo tick pra garantir que o menu foi desmontado
              setTimeout(() => item.onClick?.(), 0)
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 14px',
              background: 'transparent',
              border: 'none',
              color: item.danger ? '#e88686' : '#ccc',
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: 1.4,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = item.danger ? '#3a2020' : '#2a2535' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
