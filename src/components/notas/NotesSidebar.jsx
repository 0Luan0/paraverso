import { useState, useEffect, useRef } from 'react'

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

function NoteItem({ nota, selecionada, onSelect, onDelete, formatarData }) {
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
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-grab transition-colors ${
        selecionada
          ? 'bg-accent/10 dark:bg-accent-dark/10'
          : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
      }`}
      onClick={() => onSelect(nota)}
    >
      <span className="w-1 h-1 rounded-full bg-ink-3 dark:bg-ink-dark3 flex-shrink-0 opacity-40" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink dark:text-ink-dark truncate">{nota.titulo || 'Sem título'}</div>
        {nota.editadaEm > 0 && (
          <div className="text-xs text-ink-3 dark:text-ink-dark3">{formatarData(nota.editadaEm)}</div>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(nota.id) }}
        className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-all text-xs flex-shrink-0"
      >✕</button>
    </div>
  )
}

function SubpastaSection({ nome, notas, collapsed, onToggle, notaSelecionada, onSelect, onDelete, formatarData }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors"
      >
        <Arrow rotated={!collapsed} />
        <span className="truncate font-medium">{nome.split('/').pop()}</span>
        <span className="ml-auto text-ink-3 dark:text-ink-dark3 flex-shrink-0 opacity-60">{notas.length}</span>
      </button>
      {!collapsed && (
        <div className="ml-2 pl-2 border-l border-bdr-2 dark:border-bdr-dark2">
          {notas.map(n => (
            <NoteItem
              key={n.id}
              nota={n}
              selecionada={notaSelecionada?.id === n.id}
              onSelect={onSelect}
              onDelete={onDelete}
              formatarData={formatarData}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar principal ──────────────────────────────────────────────────────────

export function NotesSidebar({
  cadernos,
  notas,
  caderno,
  setCaderno,
  notaSelecionada,
  setNotaSelecionada,
  onNovaNota,
  onNovoCaderno,
  onDeletarCaderno,
  onDeletarNota,
  onMoverNota,
  notasPorCaderno = {},
  onCarregarCaderno,
  width,
  collapsed,
  toggleCollapsed,
  onResizeStart,
}) {
  const [novoCadernoMode, setNovoCadernoMode] = useState(false)
  const [nomeNovoCaderno, setNomeNovoCaderno] = useState('')
  const [dragOverCaderno, setDragOverCaderno] = useState(null)

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
        <span className="uppercase font-medium" style={{ color: '#3d3d3a', fontSize: '10px', letterSpacing: '0.6px' }}>
          Cadernos
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setBuscaAberta(b => !b); if (buscaAberta) { setQueryBusca(''); setResultadosBusca([]) } }}
            className={`text-xs transition-colors ${buscaAberta ? 'text-accent dark:text-accent-dark' : 'text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark'}`}
            title="Buscar notas"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
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

      {/* Busca inline */}
      {buscaAberta && (
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

      {/* Árvore unificada */}
      <div className="flex-1 overflow-auto px-2 pb-2">

        {cadernos.map(c => {
          const isAtivo    = caderno === c.nome
          const isExpanded = expandedCadernos.has(c.nome)

          return (
            <div key={c.id} className="mb-0.5">
              {/* Linha do caderno — drop target */}
              <div
                className={`group/cad flex items-center rounded-md transition-colors ${
                  dragOverCaderno === c.nome
                    ? 'bg-accent/20 dark:bg-accent-dark/20 ring-1 ring-accent/40 dark:ring-accent-dark/40'
                    : ''
                }`}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCaderno(c.nome) }}
                onDragLeave={() => setDragOverCaderno(null)}
                onDrop={e => {
                  e.preventDefault()
                  setDragOverCaderno(null)
                  console.debug('[DROP] evento no caderno:', c.nome)
                  const notaId = e.dataTransfer.getData('notaId')
                  const notaCadernoTransfer = e.dataTransfer.getData('notaCaderno')
                  console.debug('[DROP] dataTransfer:', { notaId, notaCaderno: notaCadernoTransfer })
                  if (!notaId) { console.error('[DROP] notaId vazio'); return }

                  // Busca em todas as fontes — cache pode estar stale
                  let nota = notas.find(n => n.id === notaId)
                  if (!nota) {
                    for (const cads of Object.values(notasPorCaderno ?? {})) {
                      nota = cads.find(n => n.id === notaId)
                      if (nota) break
                    }
                  }

                  if (!nota) {
                    console.error('[DnD] nota não encontrada para id:', notaId)
                    return
                  }

                  // Usa nota.caderno (fonte de verdade) em vez do dataTransfer
                  if (nota.caderno === c.nome) return

                  console.debug('[DnD] movendo nota:', { id: nota.id, titulo: nota.titulo, de: nota.caderno, para: c.nome, _filename: nota._filename, subpasta: nota.subpasta })
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

              {/* Filhos: notas — quando expandido (ativo usa notas prop, outros usam cache) */}
              {isExpanded && (() => {
                const notasDoCaderno = isAtivo ? notas : (notasPorCaderno[c.nome] ?? [])
                const raiz = notasDoCaderno.filter(n => !n.subpasta)
                const subs = {}
                for (const n of notasDoCaderno) {
                  if (n.subpasta) { if (!subs[n.subpasta]) subs[n.subpasta] = []; subs[n.subpasta].push(n) }
                }
                return (
                <div className="ml-2 mt-0.5 pl-2 border-l border-bdr-2 dark:border-bdr-dark2 space-y-0.5">
                  {notasDoCaderno.length === 0 && (
                    <p className="text-xs text-ink-3 dark:text-ink-dark3 px-2 py-2 text-center opacity-60">
                      {notasPorCaderno[c.nome] ? 'Nenhuma nota ainda.' : 'Carregando…'}
                    </p>
                  )}

                  {raiz.map(n => (
                    <NoteItem
                      key={n.id}
                      nota={n}
                      selecionada={notaSelecionada?.id === n.id}
                      onSelect={setNotaSelecionada}
                      onDelete={onDeletarNota}
                      formatarData={formatarData}
                    />
                  ))}

                  {Object.entries(subs)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([nome, notasPasta]) => (
                      <SubpastaSection
                        key={nome}
                        nome={nome}
                        notas={notasPasta}
                        collapsed={!expandedSubpastas.has(nome)}
                        onToggle={() => toggleSubpasta(nome)}
                        notaSelecionada={notaSelecionada}
                        onSelect={setNotaSelecionada}
                        onDelete={onDeletarNota}
                        formatarData={formatarData}
                      />
                    ))}
                </div>
                )})()}
            </div>
          )
        })}

        {/* Input novo caderno */}
        {novoCadernoMode && (
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

      </div>

      {/* Handle de resize — borda direita */}
      <div
        onMouseDown={onResizeStart}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-20 group"
      >
        <div className="w-full h-full opacity-0 group-hover:opacity-100 transition-opacity bg-accent dark:bg-accent-dark" />
      </div>
    </div>
  )
}
