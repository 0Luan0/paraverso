import React, { useState, useEffect, useRef, useMemo } from 'react'
import ContextMenu from '../ui/ContextMenu'

// ── Componentes internos ───────────────────────────────────────────────────────

function Arrow({ rotated }) {
  return (
    <span
      style={{
        display: 'inline-block',
        transition: 'transform 0.15s',
        transform: rotated ? 'rotate(90deg)' : 'rotate(0deg)',
        fontSize: '11px',
        lineHeight: 1,
        opacity: 0.5,
        flexShrink: 0,
      }}
    >›</span>
  )
}

const NoteItem = React.memo(function NoteItem({ nota, selecionada, onSelect, onDelete, formatarData, compact = false }) {
  return (
    <div
      draggable
      onDragStart={e => {
        console.debug('[DRAG] iniciando:', { id: nota.id, titulo: nota.titulo, caderno: nota.caderno, _filename: nota._filename })
        e.dataTransfer.setData('notaId', nota.id)
        e.dataTransfer.setData('notaCaderno', nota.caderno || '')
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.style.opacity = '0.4'
      }}
      onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
      className={`group relative flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2 py-1.5'} rounded-md cursor-grab transition-colors ${
        selecionada
          ? 'bg-accent/10 dark:bg-accent-dark/10'
          : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
      }`}
      onClick={() => onSelect(nota)}
    >
      <span className={`${compact ? 'w-0.5 h-0.5' : 'w-1 h-1'} rounded-full bg-ink-3 dark:bg-ink-dark3 flex-shrink-0 opacity-40`} />
      <div className="flex-1 min-w-0">
        <div className={`${compact ? 'text-xs' : 'text-sm'} text-ink dark:text-ink-dark truncate`}>{nota.titulo || 'Sem título'}</div>
        {!compact && nota.editadaEm > 0 && (
          <div className="text-xs text-ink-3 dark:text-ink-dark3">{formatarData(nota.editadaEm)}</div>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(nota.id) }}
        className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-all text-xs flex-shrink-0"
      >✕</button>
    </div>
  )
})

/**
 * Constrói uma árvore a partir de notas flat, usando n.subpasta como path.
 * Also includes empty folders from `diskFolders` (array of relative paths like ['A', 'A/B']).
 * Retorna { notas: [], children: Map<string, Node> } onde children são sub-pastas.
 */
function buildSubpastaTree(notas, diskFolders = []) {
  const root = { notas: [], children: new Map() }

  // Ensure all on-disk folders exist in the tree (even if empty)
  for (const folderPath of diskFolders) {
    const parts = String(folderPath).split(/[/\\]/).filter(Boolean)
    let cur = root
    for (const part of parts) {
      if (!cur.children.has(part)) {
        cur.children.set(part, { notas: [], children: new Map() })
      }
      cur = cur.children.get(part)
    }
  }

  // Place notes into the tree
  for (const n of notas) {
    if (!n.subpasta) {
      root.notas.push(n)
      continue
    }
    const parts = String(n.subpasta).split(/[/\\]/).filter(Boolean)
    let cur = root
    for (const part of parts) {
      if (!cur.children.has(part)) {
        cur.children.set(part, { notas: [], children: new Map() })
      }
      cur = cur.children.get(part)
    }
    cur.notas.push(n)
  }
  return root
}

/** Conta recursivamente todas as notas sob um node (inclusive descendentes). */
function contarNotasTree(node) {
  let total = node.notas.length
  for (const child of node.children.values()) total += contarNotasTree(child)
  return total
}

/**
 * Renderiza recursivamente uma subpasta (e suas descendentes) dentro de um caderno.
 * Cada subpasta é draggable + drop target. Drop aceita folderPath (pasta) e
 * notaId (nota — move pra essa subpasta).
 */
function SubpastaTreeNode({
  nome, node, cadernoPai, pathPrefix,
  expandedSubpastas, toggleSubpasta,
  notaSelecionada, onSelect, onDelete, formatarData,
  onMoverCaderno, onMoverNota, onContextMenu,
  notas, notasPorCaderno, notasRaiz,
}) {
  const [dragOver, setDragOver] = useState(false)
  // Counter tracks enter/leave pairs from child elements — only highlight
  // when counter > 0, and clear on drop. This prevents the "stuck highlight" bug.
  const dragCounterRef = useRef(0)
  const fullSub = pathPrefix ? `${pathPrefix}/${nome}` : nome
  const caminhoCompleto = `${cadernoPai}/${fullSub}`
  const collapsed = !expandedSubpastas.has(caminhoCompleto)
  const total = contarNotasTree(node)

  return (
    <div
      className={`rounded-md transition-colors ${dragOver ? 'bg-accent/15 dark:bg-accent-dark/15 ring-1 ring-accent/40 dark:ring-accent-dark/40' : ''}`}
      onDragEnter={e => {
        const hasFolder = e.dataTransfer.types.includes('folderpath') || e.dataTransfer.types.includes('folderPath')
        const hasNota   = e.dataTransfer.types.includes('notaid') || e.dataTransfer.types.includes('notaId')
        if (!hasFolder && !hasNota) return
        e.stopPropagation()
        dragCounterRef.current++
        setDragOver(true)
      }}
      onDragOver={e => {
        const hasFolder = e.dataTransfer.types.includes('folderpath') || e.dataTransfer.types.includes('folderPath')
        const hasNota   = e.dataTransfer.types.includes('notaid') || e.dataTransfer.types.includes('notaId')
        if (!hasFolder && !hasNota) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDragLeave={e => {
        e.stopPropagation()
        dragCounterRef.current--
        if (dragCounterRef.current <= 0) {
          dragCounterRef.current = 0
          setDragOver(false)
        }
      }}
      onDrop={e => {
        e.preventDefault()
        e.stopPropagation()
        dragCounterRef.current = 0
        setDragOver(false)
        const folderPath = e.dataTransfer.getData('folderPath')
        if (folderPath && onMoverCaderno) {
          onMoverCaderno(folderPath, caminhoCompleto)
          return
        }
        // Drop de nota em subpasta
        const notaId = e.dataTransfer.getData('notaId')
        if (!notaId || !onMoverNota) return
        let nota = notas?.find(n => n.id === notaId)
        if (!nota) {
          for (const cads of Object.values(notasPorCaderno ?? {})) {
            nota = cads.find(n => n.id === notaId)
            if (nota) break
          }
        }
        if (!nota) nota = notasRaiz?.find(n => n.id === notaId)
        if (!nota) return
        // Don't move if already in this exact subfolder
        if (nota.caderno === cadernoPai && nota.subpasta === fullSub) return
        onMoverNota(nota, caminhoCompleto)
      }}
    >
      <button
        draggable
        onDragStart={e => {
          e.stopPropagation()
          e.dataTransfer.setData('folderPath', caminhoCompleto)
          e.dataTransfer.setData('folderKind', 'subpasta')
          e.dataTransfer.effectAllowed = 'move'
          e.currentTarget.style.opacity = '0.4'
        }}
        onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
        onClick={() => toggleSubpasta(caminhoCompleto)}
        onContextMenu={e => { if (onContextMenu) onContextMenu(e, caminhoCompleto) }}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors cursor-grab"
        title={`Arrastar ${caminhoCompleto}`}
      >
        <Arrow rotated={!collapsed} />
        <span className="truncate font-medium">{nome}</span>
        <span className="ml-auto text-ink-3 dark:text-ink-dark3 flex-shrink-0 opacity-60">{total}</span>
      </button>
      {!collapsed && (
        <div className="ml-2 pl-2 border-l border-bdr-2 dark:border-bdr-dark2 space-y-0.5">
          {/* Notas diretamente neste nível */}
          {node.notas.map(n => (
            <NoteItem
              key={n.id}
              nota={n}
              selecionada={notaSelecionada?.id === n.id}
              onSelect={onSelect}
              onDelete={onDelete}
              formatarData={formatarData}
            />
          ))}
          {/* Sub-pastas (recursivo) */}
          {[...node.children.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([childNome, childNode]) => (
              <SubpastaTreeNode
                key={childNome}
                nome={childNome}
                node={childNode}
                cadernoPai={cadernoPai}
                pathPrefix={fullSub}
                expandedSubpastas={expandedSubpastas}
                toggleSubpasta={toggleSubpasta}
                notaSelecionada={notaSelecionada}
                onSelect={onSelect}
                onDelete={onDelete}
                formatarData={formatarData}
                onMoverCaderno={onMoverCaderno}
                onMoverNota={onMoverNota}
                onContextMenu={onContextMenu}
                notas={notas}
                notasPorCaderno={notasPorCaderno}
                notasRaiz={notasRaiz}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar principal ──────────────────────────────────────────────────────────

// ── Hemisphere identity ─────────────────────────────────────────────────────
const HUMAN_COLOR = '#4ec9b0'
const MACHINE_COLOR = '#b4a7f5'

function HemisphereHeader({ label, color, count, collapsed, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px 4px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto', fontFamily: 'Menlo, Monaco, monospace' }}>
        {count}
      </span>
      <span style={{ fontSize: 10, color: '#444', marginLeft: 4, transition: 'transform .15s', display: 'inline-block', transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
        ›
      </span>
    </div>
  )
}

// Purple-styled NoteItem for machine hemisphere — same functionality as NoteItem
// but with purple accent colors to visually distinguish the AI section.
const MachineNoteItem = React.memo(function MachineNoteItem({ nota, selecionada, onSelect, onDelete, formatarData, compact = false }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('notaId', nota.id)
        e.dataTransfer.setData('notaCaderno', nota.caderno || '')
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.style.opacity = '0.4'
      }}
      onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
      className={`group relative flex items-center gap-1.5 ${compact ? 'px-2 py-0.5' : 'px-2 py-1.5'} rounded-md cursor-grab transition-colors ${
        selecionada
          ? 'bg-[#9d8ff5]/10'
          : 'hover:bg-[#1a1628]'
      }`}
      onClick={() => onSelect(nota)}
    >
      <span className={`${compact ? 'w-0.5 h-0.5' : 'w-1 h-1'} rounded-full flex-shrink-0 opacity-60`} style={{ background: '#9d8ff5' }} />
      <div className="flex-1 min-w-0">
        <div className={`${compact ? 'text-xs' : 'text-sm'} truncate`} style={{ color: '#9d8ff5' }}>{nota.titulo || 'Sem título'}</div>
        {!compact && nota.editadaEm > 0 && (
          <div className="text-xs text-ink-3 dark:text-ink-dark3">{formatarData(nota.editadaEm)}</div>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(nota.id) }}
        className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-all text-xs flex-shrink-0"
      >✕</button>
    </div>
  )
})


export function NotesSidebar({
  cadernos,
  notas,
  notasRaiz = [],
  caderno,
  setCaderno,
  notaSelecionada,
  setNotaSelecionada,
  onNovaNota,
  onNovaNotaRaiz,
  onNovoCaderno,
  onDeletarCaderno,
  onDeletarNota,
  onMoverNota,
  onMoverCaderno,
  onFolderAction,
  notasPorCaderno = {},
  subpastasPorCaderno = {},
  onCarregarCaderno,
  width,
  collapsed,
  toggleCollapsed,
  onResizeStart,
  vaultPath,
}) {
  const [novoCadernoMode, setNovoCadernoMode] = useState(false)
  const [nomeNovoCaderno, setNomeNovoCaderno] = useState('')
  const [dragOverCaderno, setDragOverCaderno] = useState(null)
  const [dragOverRoot, setDragOverRoot] = useState(false)
  // Context menu: { x, y, folderPath } | null
  const [folderMenu, setFolderMenu] = useState(null)

  function abrirFolderMenu(e, folderPath) {
    e.preventDefault()
    e.stopPropagation()
    setFolderMenu({ x: e.clientX, y: e.clientY, folderPath })
  }

  function closeFolderMenu() {
    setFolderMenu(null)
  }

  const folderMenuItems = folderMenu && onFolderAction ? [
    { label: 'Nova nota',         onClick: () => onFolderAction('nova-nota',  folderMenu.folderPath) },
    { label: 'Nova pasta',        onClick: () => onFolderAction('nova-pasta', folderMenu.folderPath) },
    { separator: true },
    { label: 'Mover para…',       onClick: () => onFolderAction('mover',      folderMenu.folderPath) },
    { label: 'Renomear',          onClick: () => onFolderAction('renomear',   folderMenu.folderPath) },
    { separator: true },
    { label: 'Revelar no Finder', onClick: () => onFolderAction('revelar',    folderMenu.folderPath) },
    { separator: true },
    { label: 'Apagar',            onClick: () => onFolderAction('apagar',     folderMenu.folderPath), danger: true },
  ] : []

  // Hemisphere collapse state (persisted)
  const [humanCollapsed, setHumanCollapsed] = useState(() => localStorage.getItem('paraverso-human-collapsed') === 'true')
  const [machineCollapsed, setMachineCollapsed] = useState(() => localStorage.getItem('paraverso-machine-collapsed') === 'true')

  const toggleHuman = () => setHumanCollapsed(prev => { localStorage.setItem('paraverso-human-collapsed', String(!prev)); return !prev })
  const toggleMachine = () => setMachineCollapsed(prev => { localStorage.setItem('paraverso-machine-collapsed', String(!prev)); return !prev })

  // Load _machine notes through the normal pipeline when section is expanded
  const machineLoaded = useRef(false)
  useEffect(() => {
    if (!machineCollapsed && !machineLoaded.current && onCarregarCaderno) {
      onCarregarCaderno('_machine')
      machineLoaded.current = true
    }
  }, [machineCollapsed, onCarregarCaderno])
  // Reload when vault changes
  useEffect(() => { machineLoaded.current = false }, [vaultPath])

  // Machine notes from the normal pipeline
  const machineNotas = notasPorCaderno['_machine'] || []

  // Busca inline
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [queryBusca, setQueryBusca] = useState('')
  const [resultadosBusca, setResultadosBusca] = useState([])
  const buscaDebounceRef = useRef(null)

  // Cleanup debounce ao desmontar
  useEffect(() => {
    return () => { if (buscaDebounceRef.current) clearTimeout(buscaDebounceRef.current) }
  }, [])

  function executarBusca(query) {
    if (!query.trim()) { setResultadosBusca([]); return }
    const todasNotas = Object.values(notasPorCaderno).flat()
    const termo = query.toLowerCase()
    let resultados
    if (query.startsWith('path:')) {
      const t = query.slice(5).toLowerCase()
      resultados = todasNotas.filter(n => n.caderno?.toLowerCase().includes(t) || n.subpasta?.toLowerCase().includes(t))
    } else if (query.startsWith('file:')) {
      const t = query.slice(5).toLowerCase()
      resultados = todasNotas.filter(n => n._filename?.toLowerCase().includes(t) || n.titulo?.toLowerCase().includes(t))
    } else if (query.startsWith('tag:')) {
      const t = query.slice(4).toLowerCase()
      resultados = todasNotas.filter(n => n.tags?.some(tag => tag.toLowerCase().includes(t)))
    } else {
      resultados = todasNotas.filter(n => n.titulo?.toLowerCase().includes(termo))
    }
    setResultadosBusca(resultados.slice(0, 30))
  }

  // Pastas e subpastas iniciam fechadas
  const [expandedCadernos, setExpandedCadernos] = useState(() => new Set())
  // Subpastas expandidas — Set vazio = todas fechadas por padrão
  const [expandedSubpastas, setExpandedSubpastas] = useState(() => new Set())

  // Auto-expande o caderno ativo quando muda por ação do usuário (não no mount)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (caderno) {
      setExpandedCadernos(prev => {
        if (prev.has(caderno)) return prev
        const next = new Set(prev)
        next.add(caderno)
        return next
      })
    }
  }, [caderno])

  function toggleExpandCaderno(nome) {
    setExpandedCadernos(prev => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome)
      else next.add(nome)
      return next
    })
  }

  function selecionarCaderno(nome) {
    setCaderno(nome)
    setNotaSelecionada(null)
    // Garante que o caderno selecionado esteja expandido
    setExpandedCadernos(prev => {
      if (prev.has(nome)) return prev
      const next = new Set(prev)
      next.add(nome)
      return next
    })
  }

  function toggleSubpasta(nome) {
    setExpandedSubpastas(prev => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome)
      else next.add(nome)
      return next
    })
  }

  function criarCaderno() {
    const nome = nomeNovoCaderno.trim()
    if (!nome) return
    onNovoCaderno(nome)
    setNomeNovoCaderno('')
    setNovoCadernoMode(false)
  }

  function formatarData(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  // ── Estado colapsado ─────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        style={{ width: '40px' }}
        className="relative flex-shrink-0 flex flex-col items-center bg-surface dark:bg-surface-dark overflow-hidden"
      >
        {/* Espaço para traffic lights do macOS */}
        {window.electron && <div style={{ height: '36px', flexShrink: 0, WebkitAppRegion: 'drag' }} />}
        <button
          onClick={toggleCollapsed}
          className="p-1 rounded hover:bg-bg-2 dark:hover:bg-bg-dark2 text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          title="Expandir sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      style={{ width: `${width}px` }}
      className="relative flex-shrink-0 bg-surface dark:bg-surface-dark flex flex-col overflow-hidden"
    >
      {/* Espaço para traffic lights do macOS */}
      {window.electron && <div style={{ height: '36px', flexShrink: 0, WebkitAppRegion: 'drag' }} />}

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-1 pb-2">
        <HemisphereHeader
          label="Humano"
          color={HUMAN_COLOR}
          count={Object.values(notasPorCaderno).flat().length || notas.length}
          collapsed={humanCollapsed}
          onToggle={toggleHuman}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setBuscaAberta(b => !b); if (buscaAberta) { setQueryBusca(''); setResultadosBusca([]) } }}
            className={`text-xs transition-colors ${buscaAberta ? 'text-accent dark:text-accent-dark' : 'text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark'}`}
            title="Buscar notas"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
          <button
            onClick={() => { if (onNovaNotaRaiz) onNovaNotaRaiz() }}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors"
            title="Nova nota avulsa (raiz do vault)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </button>
          <button
            onClick={() => setNovoCadernoMode(true)}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors"
            title="Novo caderno"
          >+</button>
          <button
            onClick={toggleCollapsed}
            className="p-0.5 rounded hover:bg-bg-2 dark:hover:bg-bg-dark2 text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
            title="Recolher sidebar"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Busca inline (inside human hemisphere) */}
      {!humanCollapsed && buscaAberta && (
        <div className="px-2 pb-2 space-y-1">
          <input
            autoFocus
            value={queryBusca}
            onChange={e => {
              const v = e.target.value
              setQueryBusca(v)
              if (buscaDebounceRef.current) clearTimeout(buscaDebounceRef.current)
              buscaDebounceRef.current = setTimeout(() => executarBusca(v), 300)
            }}
            onKeyDown={e => { if (e.key === 'Escape') { setBuscaAberta(false); setQueryBusca(''); setResultadosBusca([]) } }}
            placeholder="Buscar notas..."
            className="w-full text-xs bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-md px-2 py-1.5 text-ink dark:text-ink-dark placeholder:text-ink-3 dark:placeholder:text-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark"
          />
          {/* Opções de prefix quando campo vazio */}
          {!queryBusca && (
            <div className="space-y-0.5">
              {[
                { prefix: 'path:', desc: 'buscar por pasta' },
                { prefix: 'file:', desc: 'buscar por nome de arquivo' },
                { prefix: 'tag:', desc: 'buscar por tag' },
              ].map(op => (
                <button
                  key={op.prefix}
                  onClick={() => { setQueryBusca(op.prefix); executarBusca(op.prefix) }}
                  className="w-full text-left px-2 py-1 rounded-md text-xs hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors flex items-center gap-2"
                >
                  <span className="text-accent dark:text-accent-dark font-medium">{op.prefix}</span>
                  <span className="text-ink-3 dark:text-ink-dark3 opacity-60">{op.desc}</span>
                </button>
              ))}
            </div>
          )}
          {resultadosBusca.length > 0 && (
            <div className="max-h-48 overflow-auto space-y-0.5">
              {resultadosBusca.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setNotaSelecionada(n); setBuscaAberta(false); setQueryBusca(''); setResultadosBusca([]) }}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors"
                >
                  <div className="text-ink dark:text-ink-dark truncate">{n.titulo || 'Sem título'}</div>
                  <div className="text-ink-3 dark:text-ink-dark3 text-[10px] truncate">{n.caderno}{n.subpasta ? '/' + n.subpasta : ''}</div>
                </button>
              ))}
            </div>
          )}
          {queryBusca && resultadosBusca.length === 0 && (
            <p className="text-xs text-ink-3 dark:text-ink-dark3 text-center py-2 opacity-60">Nenhum resultado</p>
          )}
        </div>
      )}

      {/* Árvore unificada — catch-all drop zone: anything not caught by a
           notebook or subfolder handler lands here = move to vault root.
           onDragOver allows the drop. onDrop only fires if no child consumed
           the event via stopPropagation(). */}
      <div
        className={`flex-1 overflow-auto px-2 pb-2 transition-colors ${dragOverRoot ? 'bg-accent/5 dark:bg-accent-dark/5' : ''}`}
        onDragOver={e => {
          const hasFolder = e.dataTransfer.types.includes('folderPath') || e.dataTransfer.types.includes('folderpath')
          const hasNota = e.dataTransfer.types.includes('notaId') || e.dataTransfer.types.includes('notaid')
          if (!hasFolder && !hasNota) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (e.target === e.currentTarget) setDragOverRoot(true)
        }}
        onDragLeave={e => {
          if (e.target === e.currentTarget) setDragOverRoot(false)
        }}
        onDrop={e => {
          e.preventDefault()
          setDragOverRoot(false)

          // 1. Folder drop → promote to vault root
          const folderPath = e.dataTransfer.getData('folderPath')
          if (folderPath && onMoverCaderno) {
            onMoverCaderno(folderPath, '')
            return
          }

          // 2. Note drop → move note to vault root (caderno = '')
          const notaId = e.dataTransfer.getData('notaId')
          if (!notaId || !onMoverNota) return
          let nota = notas.find(n => n.id === notaId)
          if (!nota) {
            for (const cads of Object.values(notasPorCaderno ?? {})) {
              nota = cads.find(n => n.id === notaId)
              if (nota) break
            }
          }
          if (!nota) nota = notasRaiz.find(n => n.id === notaId)
          if (!nota) return
          // Already at root with no subpasta — no-op
          if (!nota.folder && !nota.caderno) return
          onMoverNota(nota, '')
        }}
      >

        {!humanCollapsed && cadernos.map(c => {
          const isAtivo    = caderno === c.nome
          const isExpanded = expandedCadernos.has(c.nome)

          return (
            <div key={c.id} className="mb-0.5">
              {/* Linha do caderno — drop target (notas ou pastas) */}
              <div
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('folderPath', c.nome)
                  e.dataTransfer.setData('folderKind', 'caderno')
                  e.dataTransfer.effectAllowed = 'move'
                  e.currentTarget.style.opacity = '0.5'
                }}
                onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
                onContextMenu={e => abrirFolderMenu(e, c.nome)}
                className={`group/cad flex items-center rounded-md transition-colors cursor-grab ${
                  dragOverCaderno === c.nome
                    ? 'bg-accent/20 dark:bg-accent-dark/20 ring-1 ring-accent/40 dark:ring-accent-dark/40'
                    : ''
                }`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCaderno(c.nome) }}
                onDragLeave={() => setDragOverCaderno(null)}
                onDrop={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDragOverCaderno(null)

                  // 1. Drop de PASTA (caderno ou subpasta)
                  const folderPath = e.dataTransfer.getData('folderPath')
                  if (folderPath) {
                    if (folderPath === c.nome) return // self
                    // Cycle guard: c.nome não pode estar dentro de folderPath
                    if (c.nome === folderPath || c.nome.startsWith(folderPath + '/')) return
                    if (onMoverCaderno) onMoverCaderno(folderPath, c.nome)
                    return
                  }

                  // 2. Drop de NOTA (comportamento original)
                  const notaId = e.dataTransfer.getData('notaId')
                  if (!notaId) return

                  let nota = notas.find(n => n.id === notaId)
                  if (!nota) {
                    for (const cads of Object.values(notasPorCaderno ?? {})) {
                      nota = cads.find(n => n.id === notaId)
                      if (nota) break
                    }
                  }
                  if (!nota) nota = notasRaiz.find(n => n.id === notaId)
                  if (!nota) return
                  if (nota.caderno === c.nome) return
                  onMoverNota(nota, c.nome)
                }}
              >

                {/* Seta: só expande/recolhe — nunca seleciona caderno */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpandCaderno(c.nome)
                    // Se está expandindo e notas não carregadas, carrega em background
                    if (!expandedCadernos.has(c.nome) && onCarregarCaderno) onCarregarCaderno(c.nome)
                  }}
                  className={`w-6 h-7 flex items-center justify-center flex-shrink-0 rounded-l-md transition-colors ${
                    isAtivo
                      ? 'text-accent dark:text-accent-dark hover:bg-accent/10 dark:hover:bg-accent-dark/10'
                      : 'text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2'
                  }`}
                  title={isExpanded ? 'Recolher' : 'Expandir'}
                >
                  <Arrow rotated={isExpanded} />
                </button>

                {/* Nome do caderno: clique apenas expande/recolhe */}
                <button
                  onClick={() => {
                    toggleExpandCaderno(c.nome)
                    if (!expandedCadernos.has(c.nome) && onCarregarCaderno) onCarregarCaderno(c.nome)
                  }}
                  className={`flex-1 flex items-center text-sm px-1 py-1.5 rounded-r-md transition-colors text-left truncate ${
                    isAtivo
                      ? 'text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10'
                      : 'text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2'
                  }`}
                >
                  <span className="truncate">{c.nome}</span>
                </button>

                {/* Botão + nova nota (só no caderno ativo) */}
                {isAtivo && (
                  <button
                    onClick={onNovaNota}
                    className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors px-1 flex-shrink-0"
                    title="Nova nota"
                  >+</button>
                )}

                {/* Botão deletar (hover) */}
                <button
                  onClick={() => onDeletarCaderno(c.id, c.nome)}
                  className="opacity-0 group-hover/cad:opacity-100 text-xs text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-all px-1 flex-shrink-0"
                  title="Remover caderno"
                >✕</button>
              </div>

              {/* Filhos: notas em árvore — quando expandido (ativo usa notas prop, outros usam cache) */}
              {isExpanded && (() => {
                const notasDoCaderno = isAtivo ? notas : (notasPorCaderno[c.nome] ?? [])
                const diskFolders = subpastasPorCaderno[c.nome] || []
                const tree = buildSubpastaTree(notasDoCaderno, diskFolders)

                // If not loaded yet, trigger background load (prevents stuck "Carregando...")
                if (!isAtivo && !notasPorCaderno[c.nome] && onCarregarCaderno) {
                  onCarregarCaderno(c.nome)
                }

                return (
                <div
                  className="ml-2 mt-0.5 pl-2 border-l border-bdr-2 dark:border-bdr-dark2 space-y-0.5"
                  onDrop={e => {
                    // Catch drops inside expanded notebook area so they don't bubble to root.
                    // The note should stay in this notebook (drop on notebook header moves it).
                    e.stopPropagation()
                    const notaId = e.dataTransfer.getData('notaId')
                    if (!notaId) return
                    e.preventDefault()
                    // Move note to this notebook's root (no subfolder)
                    let nota = notas.find(n => n.id === notaId)
                    if (!nota) {
                      for (const cads of Object.values(notasPorCaderno ?? {})) {
                        nota = cads.find(n => n.id === notaId)
                        if (nota) break
                      }
                    }
                    if (!nota) nota = notasRaiz.find(n => n.id === notaId)
                    if (!nota) return
                    if (nota.caderno === c.nome && !nota.subpasta) return
                    onMoverNota(nota, c.nome)
                  }}
                  onDragOver={e => {
                    const hasNota = e.dataTransfer.types.includes('notaId') || e.dataTransfer.types.includes('notaid')
                    if (hasNota) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
                  }}
                >
                  {notasDoCaderno.length === 0 && tree.children.size === 0 && (
                    <p className="text-xs text-ink-3 dark:text-ink-dark3 px-2 py-2 text-center opacity-60">
                      Nenhuma nota ainda.
                    </p>
                  )}

                  {/* Notas no topo do caderno (sem subpasta) */}
                  {tree.notas.map(n => (
                    <NoteItem
                      key={n.id}
                      nota={n}
                      selecionada={notaSelecionada?.id === n.id}
                      onSelect={setNotaSelecionada}
                      onDelete={onDeletarNota}
                      formatarData={formatarData}
                    />
                  ))}

                  {/* Subpastas aninhadas como árvore recursiva */}
                  {[...tree.children.entries()]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([nome, node]) => (
                      <SubpastaTreeNode
                        key={nome}
                        nome={nome}
                        node={node}
                        cadernoPai={c.nome}
                        pathPrefix=""
                        expandedSubpastas={expandedSubpastas}
                        toggleSubpasta={toggleSubpasta}
                        notaSelecionada={notaSelecionada}
                        onSelect={setNotaSelecionada}
                        onDelete={onDeletarNota}
                        formatarData={formatarData}
                        onMoverCaderno={onMoverCaderno}
                        onMoverNota={onMoverNota}
                        onContextMenu={abrirFolderMenu}
                        notas={notas}
                        notasPorCaderno={notasPorCaderno}
                        notasRaiz={notasRaiz}
                      />
                    ))}
                </div>
                )})()}
            </div>
          )
        })}

        {/* Notas raiz (sem caderno) — lista solta abaixo dos cadernos, compacta */}
        {!humanCollapsed && notasRaiz.length > 0 && (
          <div className="mt-2">
            {notasRaiz.map(n => (
              <NoteItem
                key={n.id}
                nota={n}
                selecionada={notaSelecionada?.id === n.id}
                onSelect={setNotaSelecionada}
                onDelete={onDeletarNota}
                formatarData={formatarData}
                compact
              />
            ))}
          </div>
        )}

        {/* Input novo caderno */}
        {!humanCollapsed && novoCadernoMode && (
          <div className="flex gap-1 mt-2 px-1">
            <input
              autoFocus
              value={nomeNovoCaderno}
              onChange={e => setNomeNovoCaderno(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') criarCaderno()
                if (e.key === 'Escape') setNovoCadernoMode(false)
              }}
              placeholder="Nome..."
              className="flex-1 text-xs bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded px-2 py-1 text-ink dark:text-ink-dark focus:outline-none focus:border-accent dark:focus:border-accent-dark"
            />
            <button onClick={criarCaderno} className="text-xs text-accent dark:text-accent-dark font-medium">OK</button>
          </div>
        )}

        {/* ── Divisor entre hemisférios ───────────────────────────── */}
        <div style={{ height: '0.5px', background: '#2a2a2a', margin: '6px 12px' }} />

        {/* ── Hemisfério Máquina ──────────────────────────────────── */}
        <HemisphereHeader
          label="Máquina"
          color={MACHINE_COLOR}
          count={machineNotas.length}
          collapsed={machineCollapsed}
          onToggle={toggleMachine}
        />

        {!machineCollapsed && (() => {
          const tree = buildSubpastaTree(machineNotas)
          return (
            <div className="mt-1 space-y-0.5">
              {machineNotas.length === 0 && (
                <p className="text-xs px-3 py-2 text-center" style={{ color: '#555' }}>
                  Nenhum arquivo da IA ainda.
                </p>
              )}

              {/* Notes at _machine root */}
              {tree.notas.map(n => (
                <MachineNoteItem
                  key={n.id}
                  nota={n}
                  selecionada={notaSelecionada?.id === n.id}
                  onSelect={setNotaSelecionada}
                  onDelete={onDeletarNota}
                  formatarData={formatarData}
                />
              ))}

              {/* Subfolders inside _machine (contexts, etc.) */}
              {[...tree.children.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([nome, node]) => (
                  <SubpastaTreeNode
                    key={nome}
                    nome={nome}
                    node={node}
                    cadernoPai="_machine"
                    pathPrefix=""
                    expandedSubpastas={expandedSubpastas}
                    toggleSubpasta={toggleSubpasta}
                    notaSelecionada={notaSelecionada}
                    onSelect={setNotaSelecionada}
                    onDelete={onDeletarNota}
                    formatarData={formatarData}
                    onMoverCaderno={onMoverCaderno}
                    onMoverNota={onMoverNota}
                    onContextMenu={abrirFolderMenu}
                    notas={notas}
                    notasPorCaderno={notasPorCaderno}
                    notasRaiz={notasRaiz}
                  />
                ))}
            </div>
          )
        })()}

      </div>

      {/* Handle de resize — borda direita */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 group"
      >
        <div className="w-full h-full opacity-0 group-hover:opacity-100 transition-opacity bg-accent dark:bg-accent-dark" />
      </div>

      {/* Context menu de pasta (right-click em caderno ou subpasta) */}
      {folderMenu && (
        <ContextMenu
          x={folderMenu.x}
          y={folderMenu.y}
          items={folderMenuItems}
          onClose={closeFolderMenu}
        />
      )}
    </div>
  )
}
