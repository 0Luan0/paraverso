// src/components/layout/ActivityBar.jsx
import { useState } from 'react'

// Ícones SVG inline — 13x13, stroke 1.1
const IconNotas = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="11" height="11" rx="2"/>
    <line x1="3.5" y1="4" x2="9.5" y2="4"/>
    <line x1="3.5" y1="6.5" x2="9.5" y2="6.5"/>
    <line x1="3.5" y1="9" x2="6.5" y2="9"/>
  </svg>
)

const IconMes = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="11" height="10" rx="2"/>
    <line x1="1" y1="5.5" x2="12" y2="5.5"/>
    <line x1="4" y1="0.5" x2="4" y2="3.5"/>
    <line x1="9" y1="0.5" x2="9" y2="3.5"/>
  </svg>
)

const IconGrafo = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <circle cx="3.5" cy="6.5" r="2"/>
    <circle cx="10" cy="3" r="1.6"/>
    <circle cx="10" cy="10" r="1.6"/>
    <line x1="5.4" y1="5.7" x2="8.5" y2="3.7"/>
    <line x1="5.4" y1="7.3" x2="8.5" y2="9.3"/>
  </svg>
)

const IconCalendario = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="2" width="11" height="10" rx="2"/>
    <line x1="1" y1="5.5" x2="12" y2="5.5"/>
    <line x1="4" y1="0.5" x2="4" y2="3.5"/>
    <line x1="9" y1="0.5" x2="9" y2="3.5"/>
    <line x1="4" y1="8.5" x2="9" y2="8.5"/>
  </svg>
)

const IconConfig = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

const ABAS = [
  { id: 'notas',  icon: IconNotas,      title: 'Notas' },
  { id: 'mes',    icon: IconMes,        title: 'Mês' },
  { id: 'grafo',  icon: IconGrafo,      title: 'Grafo' },
]

function BarButton({ label, active, onClick, children, className = '' }) {
  const [hover, setHover] = useState(false)
  const [rect, setRect] = useState(null)

  return (
    <>
      <button
        onClick={onClick}
        onMouseEnter={e => { setRect(e.currentTarget.getBoundingClientRect()); setHover(true) }}
        onMouseLeave={() => setHover(false)}
        className={`relative flex items-center justify-center w-full ${className}`}
        style={{
          height: '32px',
          color: active ? '#c8c4be' : hover ? '#888880' : '#4a4a4a',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {active && (
          <div
            className="absolute left-0"
            style={{ width: '2.5px', height: '20px', background: '#e8a44a', borderRadius: '0 2px 2px 0' }}
          />
        )}
        {children}
      </button>
      {hover && rect && (
        <div
          style={{
            position: 'fixed',
            left: '40px',
            top: rect.top + rect.height / 2,
            transform: 'translateY(-50%)',
            background: '#2a2a2a',
            color: '#e8e8e8',
            fontSize: '11px',
            padding: '3px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 9999,
            border: '1px solid #3a3a3a',
          }}
        >{label}</div>
      )}
    </>
  )
}

const IconTerminal = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
    stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1.5" width="11" height="10" rx="2"/>
    <polyline points="3.5,5 5.5,7 3.5,9"/>
    <line x1="7" y1="9" x2="9.5" y2="9"/>
  </svg>
)

export default function ActivityBar({ abaAtiva, onAbaChange, onNotaDia, terminalOpen, onToggleTerminal }) {
  const isElectron = typeof window !== 'undefined' && window.electron

  return (
    <div
      className="flex flex-col items-center flex-shrink-0 select-none"
      style={{
        width: '32px',
        background: '#181818',
        paddingTop: isElectron ? '36px' : '12px',
      }}
    >
      {/* Abas principais */}
      <div className="flex flex-col items-center gap-1 w-full">
        {ABAS.map(({ id, icon: Icon, title }) => (
          <BarButton key={id} label={title} active={abaAtiva === id} onClick={() => onAbaChange(id)}>
            <Icon />
          </BarButton>
        ))}
      </div>

      {/* Nota do dia */}
      <BarButton label="Nota do dia" active={false} onClick={onNotaDia} className="mt-2">
        <IconCalendario />
      </BarButton>

      <div className="flex-1" />

      {/* Terminal IA */}
      <BarButton label="IA (Terminal)" active={terminalOpen} onClick={onToggleTerminal} className="mb-1">
        <IconTerminal />
      </BarButton>

      {/* Configurações */}
      <BarButton label="Configurações" active={abaAtiva === 'config'} onClick={() => onAbaChange('config')} className="mb-3">
        <IconConfig />
      </BarButton>
    </div>
  )
}
