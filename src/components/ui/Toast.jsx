import { useEffect } from 'react'

/**
 * Toast genérico disparado via evento `paraverso:toast`.
 * Tipos: 'info' (neutro), 'erro' (destaque vermelho).
 *
 * Irmão do MachineToast — não reaproveita estilo pra evitar regressão
 * na feature de IA.
 */
export default function Toast({ tipo = 'info', mensagem, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, tipo === 'erro' ? 6000 : 4000)
    return () => clearTimeout(timer)
  }, [onClose, tipo])

  const isErro = tipo === 'erro'
  const accent = isErro ? '#e88686' : '#86c9e8'
  const label  = isErro ? 'Erro' : 'Info'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 14px',
      background: '#1e1e2e',
      border: `0.5px solid ${isErro ? '#553a3a' : '#3a4a55'}`,
      borderRadius: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      animation: 'fadeIn .25s ease',
      maxWidth: 360,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: accent }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2, wordBreak: 'break-word' }}>
          {mensagem}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          marginLeft: 8,
          color: '#444',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
