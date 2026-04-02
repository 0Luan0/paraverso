import { useState, useRef, useEffect } from 'react'

// ─── Ícones inline (13x13) ───────────────────────────────────────────────────
const IcoEdit = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2l2 2-7 7H2v-2L9 2z"/>
  </svg>
)
const IcoMove = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 6.5h9M7.5 3L11 6.5 7.5 10"/>
    <path d="M1 2v9"/>
  </svg>
)
const IcoCopy = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="8" height="8" rx="1.5"/>
    <path d="M9 4V2.5A1.5 1.5 0 007.5 1H2.5A1.5 1.5 0 001 2.5v5A1.5 1.5 0 002.5 9H4"/>
  </svg>
)
const IcoOpen = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12h8A1.5 1.5 0 0012 10.5V8"/>
    <path d="M8 1h4v4"/>
    <path d="M12 1L6 7"/>
  </svg>
)
const IcoTrash = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3h11M4 3V2a1 1 0 011-1h3a1 1 0 011 1v1M5.5 6v4M7.5 6v4M2 3l.8 8a1 1 0 001 .9h4.4a1 1 0 001-.9L10 3"/>
  </svg>
)

// ─── MenuItem ────────────────────────────────────────────────────────────────
function MenuItem({ icon, label, onClick, danger }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
        padding: '6px 12px', background: hov ? '#2a2a2a' : 'transparent',
        border: 'none', cursor: 'pointer', fontSize: '12px',
        color: danger ? '#e05c5c' : '#c8c4be', textAlign: 'left',
        borderRadius: '4px', whiteSpace: 'nowrap',
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
    >
      <span style={{ color: danger ? '#e05c5c' : '#666', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  )
}

// ─── InputModal (renomear) ───────────────────────────────────────────────────
function InputModal({ title, placeholder, defaultValue, onConfirm, onCancel }) {
  const [val, setVal] = useState(defaultValue ?? '')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  const confirm = () => { const v = val.trim(); if (v) onConfirm(v) }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: '#1e1e1e', borderRadius: '8px', padding: '20px', width: '340px', border: '1px solid #2a2a2a' }} onClick={e => e.stopPropagation()}>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#d4cfc9', fontWeight: 500 }}>{title}</p>
        <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel() }}
          placeholder={placeholder}
          style={{ width: '100%', boxSizing: 'border-box', background: '#141414', border: '1px solid #333', borderRadius: '5px', padding: '7px 10px', color: '#d4cfc9', fontSize: '13px', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '5px 14px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
          <button onClick={confirm} style={{ padding: '5px 14px', borderRadius: '5px', border: 'none', background: '#e8a44a', color: '#1a1a1a', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

// ─── ConfirmModal (apagar) ───────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: '#1e1e1e', borderRadius: '8px', padding: '20px', width: '320px', border: '1px solid #2a2a2a' }} onClick={e => e.stopPropagation()}>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#d4cfc9', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '5px 14px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '12px' }}>Cancelar</button>
          <button onClick={onConfirm} style={{ padding: '5px 14px', borderRadius: '5px', border: 'none', background: '#e05c5c', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Apagar</button>
        </div>
      </div>
    </div>
  )
}

// ─── MovePicker (lista de cadernos) ──────────────────────────────────────────
function MovePicker({ cadernos, cadernoAtual, onConfirm, onCancel }) {
  const disponiveis = cadernos.filter(c => c.nome !== cadernoAtual).map(c => c.nome)
  if (disponiveis.length === 0) {
    return <InputModal title="Mover para pasta" placeholder="Nome da pasta" defaultValue="" onConfirm={onConfirm} onCancel={onCancel} />
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div style={{ background: '#1e1e1e', borderRadius: '8px', padding: '16px', width: '320px', maxHeight: '400px', border: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#d4cfc9', fontWeight: 500 }}>Mover para...</p>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {disponiveis.map(nome => (
            <MoveItem key={nome} nome={nome} onClick={() => onConfirm(nome)} />
          ))}
        </div>
        <button onClick={onCancel} style={{ marginTop: '10px', padding: '5px 14px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#888', cursor: 'pointer', fontSize: '12px', alignSelf: 'flex-end' }}>Cancelar</button>
      </div>
    </div>
  )
}

function MoveItem({ nome, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'block', width: '100%', padding: '6px 12px', background: hov ? '#2a2a2a' : 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#c8c4be', textAlign: 'left', borderRadius: '4px' }}
    >{nome}</button>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function NoteActionsMenu({ nota, cadernos, vaultPath, onRename, onMove, onDelete, onOpenExternal }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState(null) // 'rename' | 'move' | 'delete' | 'copied'
  const menuRef = useRef(null)
  const copiedTimerRef = useRef(null)

  // Cleanup timer ao desmontar
  useEffect(() => {
    return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!nota) return null

  const nomeAtual = nota.titulo || ''

  const handleCopiarCaminho = async () => {
    setOpen(false)
    const filename = nota._filename || nota.titulo || ''
    const fullPath = vaultPath ? `${vaultPath}/${nota.caderno || ''}/${filename}.md` : filename
    try {
      await navigator.clipboard.writeText(fullPath)
      setModal('copied')
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
      copiedTimerRef.current = setTimeout(() => setModal(null), 1500)
    } catch { /* ignore */ }
  }

  return (
    <>
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            background: open ? '#2a2a2a' : 'transparent',
            border: 'none', cursor: 'pointer',
            color: open ? '#c8c4be' : '#4a4a4a',
            borderRadius: '4px', padding: '3px 6px',
            fontSize: '11px', lineHeight: 1, letterSpacing: '1.5px',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => { if (!open) e.currentTarget.style.color = '#888' }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.color = '#4a4a4a' }}
        >•••</button>

        {open && (
          <div style={{
            position: 'fixed',
            top: menuRef.current ? menuRef.current.getBoundingClientRect().bottom + 4 : 60,
            right: menuRef.current ? window.innerWidth - menuRef.current.getBoundingClientRect().right : 16,
            background: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: '7px',
            padding: '4px', minWidth: '200px', zIndex: 9990,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <MenuItem icon={<IcoEdit />}  label="Renomear"        onClick={() => { setOpen(false); setModal('rename') }} />
            <MenuItem icon={<IcoMove />}  label="Mover para..."   onClick={() => { setOpen(false); setModal('move') }} />
            <div style={{ height: '1px', background: '#2a2a2a', margin: '4px 0' }} />
            <MenuItem icon={<IcoCopy />}  label="Copiar caminho"  onClick={handleCopiarCaminho} />
            <MenuItem icon={<IcoOpen />}  label="Abrir no Finder" onClick={() => { setOpen(false); onOpenExternal?.() }} />
            <div style={{ height: '1px', background: '#2a2a2a', margin: '4px 0' }} />
            <MenuItem icon={<IcoTrash />} label="Apagar nota"     onClick={() => { setOpen(false); setModal('delete') }} danger />
          </div>
        )}
      </div>

      {modal === 'rename' && (
        <InputModal title="Renomear nota" placeholder="Novo título" defaultValue={nomeAtual}
          onConfirm={v => { setModal(null); onRename?.(v) }}
          onCancel={() => setModal(null)} />
      )}
      {modal === 'move' && (
        <MovePicker cadernos={cadernos || []} cadernoAtual={nota.caderno}
          onConfirm={v => { setModal(null); onMove?.(v) }}
          onCancel={() => setModal(null)} />
      )}
      {modal === 'delete' && (
        <ConfirmModal message={`Apagar "${nomeAtual}"? Esta ação não pode ser desfeita.`}
          onConfirm={() => { setModal(null); onDelete?.() }}
          onCancel={() => setModal(null)} />
      )}
      {modal === 'copied' && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: '#2a2a2a', color: '#d4cfc9', fontSize: '12px', padding: '6px 14px', borderRadius: '6px', zIndex: 9999, border: '1px solid #3a3a3a', pointerEvents: 'none' }}>
          Caminho copiado
        </div>
      )}
    </>
  )
}
