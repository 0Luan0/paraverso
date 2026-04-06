import { useState, useRef, useEffect } from 'react'

/**
 * Modal genérico de input (renomear, nova pasta, etc).
 * Auto-foca e seleciona o texto ao abrir. Enter confirma, Escape cancela.
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
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ background: '#1e1e1e', borderRadius: 8, padding: 20, width: 340, border: '1px solid #2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#d4cfc9', fontWeight: 500 }}>{title}</p>
        <input
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') confirm()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', background: '#141414', border: '1px solid #333', borderRadius: 5, padding: '7px 10px', color: '#d4cfc9', fontSize: 13, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 12 }}
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #555', background: '#2a2a2a', color: '#e4e4e4', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Modal de confirmação destrutiva (deletar pasta, etc).
 */
export function ConfirmModal({ message, confirmLabel = 'Apagar', onConfirm, onCancel }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ background: '#1e1e1e', borderRadius: 8, padding: 20, width: 340, border: '1px solid #2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#d4cfc9', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 12 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '5px 14px', borderRadius: 5, border: 'none', background: '#e05c5c', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Picker de pasta destino — lista todos os cadernos+subpastas disponíveis.
 * Usado pelo "Mover para..." do context menu de pastas.
 */
export function FolderPicker({ cadernos, excludePath, onConfirm, onCancel }) {
  // Monta lista de destinos: raiz + todos os cadernos top-level
  // (não mostra subpastas aninhadas — pra isso o usuário pode digitar ou dragar)
  const opcoes = [
    { label: '(Raiz do vault)', value: '' },
    ...cadernos
      .filter(c => c.nome !== excludePath && !c.nome.startsWith(excludePath + '/'))
      .map(c => ({ label: c.nome, value: c.nome })),
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div
        style={{ background: '#1e1e1e', borderRadius: 8, padding: 20, width: 360, border: '1px solid #2a2a2a', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#d4cfc9', fontWeight: 500 }}>
          Mover para onde?
        </p>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {opcoes.length === 0 && (
            <p style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: 16 }}>
              Nenhum destino disponível
            </p>
          )}
          {opcoes.map(op => (
            <button
              key={op.value || '__root__'}
              onClick={() => onConfirm(op.value)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 5, color: '#d4cfc9', cursor: 'pointer', fontSize: 13, marginBottom: 2 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a2535' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {op.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end', borderTop: '1px solid #2a2a2a', paddingTop: 12 }}>
          <button
            onClick={onCancel}
            style={{ padding: '5px 14px', borderRadius: 5, border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: 12 }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
