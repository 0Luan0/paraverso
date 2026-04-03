import { useEffect } from 'react'

export default function MachineToast({ filename, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const label = type === 'rename' ? 'criou' : 'atualizou'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      background: '#1e1e2e',
      border: '0.5px solid #3a3555',
      borderRadius: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      animation: 'fadeIn .25s ease',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#b4a7f5', flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#b4a7f5' }}>
          IA {label} nota
        </div>
        <div style={{ fontSize: 11, color: '#666', fontFamily: 'Menlo, Monaco, monospace', marginTop: 1 }}>
          _machine/{filename}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{ marginLeft: 12, color: '#444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}
