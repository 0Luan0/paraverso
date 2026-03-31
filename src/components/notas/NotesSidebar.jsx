import { useState, useMemo, useEffect } from 'react'

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
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
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
}) {
  const [novoCadernoMode, setNovoCadernoMode] = useState(false)
  const [nomeNovoCaderno, setNomeNovoCaderno] = useState('')

  // Estado de expansão dos cadernos: separado do caderno ativo
  // Set de nomes de cadernos que estão expandidos
  const [expandedCadernos, setExpandedCadernos] = useState(() => new Set())

  // Estado de expansão das subpastas: collapsed por nome
  const [collapsedSubpastas, setCollapsedSubpastas] = useState(new Set())

  // Auto-expande o caderno ativo quando ele muda
  useEffect(() => {
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
    setCollapsedSubpastas(prev => {
      const next = new Set(prev)
      if (next.has(nome)) next.delete(nome)
      else next.add(nome)
      return next
    })
  }

  const { notasRaiz, porSubpasta } = useMemo(() => {
    const raiz = []
    const sub = {}
    for (const n of notas) {
      if (!n.subpasta) {
        raiz.push(n)
      } else {
        if (!sub[n.subpasta]) sub[n.subpasta] = []
        sub[n.subpasta].push(n)
      }
    }
    return { notasRaiz: raiz, porSubpasta: sub }
  }, [notas])

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

  return (
    <div className="w-56 flex-shrink-0 border-r border-bdr dark:border-bdr-dark bg-surface dark:bg-surface-dark flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-xs text-ink-3 dark:text-ink-dark3 uppercase tracking-wider font-medium">
          Cadernos
        </span>
        <button
          onClick={() => setNovoCadernoMode(true)}
          className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors"
          title="Novo caderno"
        >+</button>
      </div>

      {/* Árvore unificada */}
      <div className="flex-1 overflow-auto px-2 pb-2">

        {cadernos.map(c => {
          const isAtivo    = caderno === c.nome
          const isExpanded = expandedCadernos.has(c.nome)

          return (
            <div key={c.id} className="mb-0.5">
              {/* Linha do caderno */}
              <div className="group/cad flex items-center rounded-md">

                {/* Seta:
                  - caderno ativo → toggle independente (sem mudar ativo)
                  - caderno não-ativo → seleciona e expande */}
                <button
                  onClick={() => isAtivo ? toggleExpandCaderno(c.nome) : selecionarCaderno(c.nome)}
                  className={`w-6 h-7 flex items-center justify-center flex-shrink-0 rounded-l-md transition-colors ${
                    isAtivo
                      ? 'text-accent dark:text-accent-dark hover:bg-accent/10 dark:hover:bg-accent-dark/10'
                      : 'text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2'
                  }`}
                  title={isAtivo ? (isExpanded ? 'Recolher' : 'Expandir') : 'Selecionar'}
                >
                  <Arrow rotated={isAtivo ? isExpanded : false} />
                </button>

                {/* Nome do caderno: clique seleciona E expande */}
                <button
                  onClick={() => selecionarCaderno(c.nome)}
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

              {/* Filhos: notas + subpastas — só quando expandido E ativo */}
              {isAtivo && isExpanded && (
                <div className="ml-2 mt-0.5 pl-2 border-l border-bdr-2 dark:border-bdr-dark2 space-y-0.5">
                  {notas.length === 0 && (
                    <p className="text-xs text-ink-3 dark:text-ink-dark3 px-2 py-2 text-center opacity-60">
                      Nenhuma nota ainda.
                    </p>
                  )}

                  {/* Notas na raiz do caderno */}
                  {notasRaiz.map(n => (
                    <NoteItem
                      key={n.id}
                      nota={n}
                      selecionada={notaSelecionada?.id === n.id}
                      onSelect={setNotaSelecionada}
                      onDelete={onDeletarNota}
                      formatarData={formatarData}
                    />
                  ))}

                  {/* Subpastas */}
                  {Object.entries(porSubpasta)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([nome, notasPasta]) => (
                      <SubpastaSection
                        key={nome}
                        nome={nome}
                        notas={notasPasta}
                        collapsed={collapsedSubpastas.has(nome)}
                        onToggle={() => toggleSubpasta(nome)}
                        notaSelecionada={notaSelecionada}
                        onSelect={setNotaSelecionada}
                        onDelete={onDeletarNota}
                        formatarData={formatarData}
                      />
                    ))}
                </div>
              )}
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
    </div>
  )
}
