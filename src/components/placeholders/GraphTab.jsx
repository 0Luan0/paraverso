import { useEffect, useState, useCallback, useRef } from 'react'
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force'
import { select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'
import { drag as d3Drag } from 'd3-drag'
import { getNotasParaGrafo } from '../../db/index'
import { useVault } from '../../contexts/VaultContext'
import { mergeGraphNodes, machineNodeColor } from '../../lib/graphHemisphere'
import { corPorCaderno } from '../../lib/graphColors'

const COR_PADRAO = 'rgba(200,190,175,0.85)'


// ── Config padrão ──
const DEFAULT_CONFIG = {
  nodeSize: 3,
  labelSize: 9,
  linkWidth: 0.4,
  linkOpacity: 0.32,
  repulsion: -300,
  linkDistance: 80,
  gravity: 0.08,
  showLabels: true,
  colorByCaderno: true,
  showIsolados: false,
}

// ── Slider reutilizável ──
function ConfigSlider({ label, value, min, max, step, onChange, dark }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 10, minWidth: 70 }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: '#e4e4e4', height: 3 }}
      />
      <span style={{ fontSize: 9, minWidth: 22, textAlign: 'right', opacity: 0.6 }}>{value}</span>
    </div>
  )
}

// ── Toggle reutilizável ──
function ConfigToggle({ label, checked, onChange, dark }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 10, cursor: 'pointer' }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: '#e4e4e4' }} />
    </label>
  )
}

// ── Cores para novos grupos ──
const GRUPO_CORES = ['#4A9EFF','#4CAF82','#E8943A','#E85D5D','#B06BE8','#4DC8E8','#F0C040','#FF6B9D']

// ── Opções de busca com prefix ──
const OPCOES_BUSCA = [
  { prefix: 'path:', label: 'path:', desc: 'corresponder caminho/caderno' },
  { prefix: 'section:', label: 'section:', desc: 'pesquisar por título da nota' },
]

// ── Item de grupo (autocomplete + color picker) ──
function GrupoItem({ grupo, cadernos, onUpdate, onRemove }) {
  const [query, setQuery] = useState(grupo.query ?? '')
  const [sugestoes, setSugestoes] = useState([])
  const [showSugestoes, setShowSugestoes] = useState(false)
  const [showOpcoes, setShowOpcoes] = useState(false)
  const [cor, setCor] = useState(grupo.cor)
  const inputRef = useRef(null)

  const handleFocus = () => {
    if (query === '') {
      setShowOpcoes(true)
      setShowSugestoes(false)
    } else {
      handleChange(query)
    }
  }

  const handleChange = (v) => {
    setQuery(v)
    if (v === '') {
      setSugestoes([])
      setShowOpcoes(true)
      setShowSugestoes(false)
      return
    }
    setShowOpcoes(false)
    const prefixMatch = OPCOES_BUSCA.find(op => v.startsWith(op.prefix))
    const termo = prefixMatch ? v.slice(prefixMatch.prefix.length).toLowerCase() : v.toLowerCase()
    const filtradas = termo
      ? cadernos.filter(c => c.toLowerCase().includes(termo))
      : cadernos
    setSugestoes(filtradas)
    setShowSugestoes(true)
  }

  const handleSelect = (s) => {
    const prefixMatch = OPCOES_BUSCA.find(op => query.startsWith(op.prefix))
    const novoQuery = prefixMatch ? prefixMatch.prefix + s : s
    setQuery(novoQuery)
    setShowSugestoes(false)
    setShowOpcoes(false)
    onUpdate({ ...grupo, query: novoQuery })
  }

  const handleQueryBlur = () => {
    setTimeout(() => { setShowSugestoes(false); setShowOpcoes(false) }, 150)
    onUpdate({ ...grupo, query })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, position: 'relative' }}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
      {/* Input query com autocomplete */}
      <div style={{ flex: 1, position: 'relative' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleQueryBlur}
          placeholder="buscar..."
          style={{
            width: '100%', background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 5, color: 'white', fontSize: 12,
            padding: '5px 8px', boxSizing: 'border-box', outline: 'none',
          }}
        />
        {/* Menu de opções de busca (query vazio) — abre para CIMA */}
        {showOpcoes && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0,
            background: 'rgba(20,18,15,0.99)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, zIndex: 500, marginBottom: 2,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '6px 10px 4px', fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              Opções de busca
            </div>
            {OPCOES_BUSCA.map(op => (
              <div key={op.prefix}
                onMouseDown={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setQuery(op.prefix)
                  setShowOpcoes(false)
                  setSugestoes(cadernos)
                  setShowSugestoes(true)
                  setTimeout(() => inputRef.current?.focus(), 0)
                }}
                style={{
                  padding: '5px 10px', cursor: 'pointer',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: '#e4e4e4', fontSize: 11, fontWeight: 600 }}>{op.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginLeft: 4 }}>{op.desc}</span>
              </div>
            ))}
          </div>
        )}
        {/* Lista de sugestões — abre para CIMA */}
        {showSugestoes && sugestoes.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0,
            background: 'rgba(20,18,15,0.99)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, zIndex: 500,
            maxHeight: 160, overflowY: 'auto', marginBottom: 2,
          }}>
            {sugestoes.slice(0, 10).map(s => (
              <div key={s}
                onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleSelect(s) }}
                style={{
                  padding: '5px 10px', fontSize: 11,
                  color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{s}</div>
            ))}
          </div>
        )}
      </div>
      {/* Cor — label envolvendo input color invisível mas clicável */}
      <label
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 22, height: 22, borderRadius: '50%',
          background: cor, cursor: 'pointer', flexShrink: 0,
          border: '2px solid rgba(255,255,255,0.3)',
          display: 'block', overflow: 'hidden',
          position: 'relative',
        }}
      >
        <input
          type="color"
          value={cor}
          onChange={e => { e.stopPropagation(); setCor(e.target.value) }}
          onBlur={e => { e.stopPropagation(); onUpdate({ ...grupo, query, cor: e.target.value }) }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '200%', height: '200%',
            opacity: 0, cursor: 'pointer',
            transform: 'translate(-25%,-25%)',
          }}
        />
      </label>
      {/* Remover */}
      <button
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); onRemove(grupo.id) }}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 14, padding: '0 2px', flexShrink: 0 }}
      >✕</button>
    </div>
  )
}

// ── Seção colapsável do config ──
function ConfigSection({ title, open, onToggle, children }) {
  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', padding: '2px 0', userSelect: 'none',
        }}
      >
        <span style={{ fontWeight: 500, fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1 }}>
          {title}
        </span>
        <span style={{ fontSize: 10, opacity: 0.4, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ›
        </span>
      </div>
      {open && <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  )
}

const LABEL_THRESHOLD = 150

export function GraphTab({ dark }) {
  const { vaultPath } = useVault()
  const [loading, setLoading] = useState(true)
  const [notaSelecionada, setNotaSelecionada] = useState(null)
  const [stats, setStats] = useState({ notas: 0, arestas: 0 })
  const [buscaQuery, setBuscaQuery] = useState('')
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [configOpen, setConfigOpen] = useState(false)
  const [openSections, setOpenSections] = useState({ grupos: true })
  const updateConfig = (key, val) => setConfig(prev => ({ ...prev, [key]: val }))

  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const gRef = useRef(null)
  const simRef = useRef(null)
  const zoomRef = useRef(null)
  const zoomInitialized = useRef(false)
  const graphDataRef = useRef({ simNodes: [], simLinks: [], adjacency: new Map(), rawLinks: [] })
  const fixedNodesRef = useRef(new Set())
  const isDragging = useRef(false)
  // Refs to d3 selections for visual updates without recreation
  const linkSelRef = useRef(null)
  const nodeSelRef = useRef(null)
  const updateLabelVisibilityRef = useRef(null)
  // Grupos de cor customizáveis (query-based)
  const [grupos, setGrupos] = useState(() => {
    try {
      const salvo = localStorage.getItem('paraverso-graph-grupos')
      return salvo ? JSON.parse(salvo) : []
    } catch { return [] }
  })
  // Persistir grupos no localStorage
  useEffect(() => {
    try { localStorage.setItem('paraverso-graph-grupos', JSON.stringify(grupos)) } catch {}
  }, [grupos])

  // Lista de cadernos/títulos para autocomplete (estado React para re-render)
  const cadernosRef = useRef([])
  const [listaCadernos, setListaCadernos] = useState([])

  // ── useEffect A — Carregar dados + criar simulation + renderizar SVG ──────
  useEffect(() => {
    let cancelled = false

    async function construirGrafo() {
      setLoading(true)
      const notasHumanas = await getNotasParaGrafo()
      if (cancelled) return

      // Merge machine hemisphere files
      let machineFiles = []
      try { machineFiles = await window.electron?.machineContext?.listFiles(vaultPath) || [] } catch {}
      const notas = mergeGraphNodes(notasHumanas, machineFiles)

      if (notas.length === 0) {
        setStats({ notas: 0, arestas: 0 })
        setLoading(false)
        return
      }

      // índice título → id
      const tituloPorId = {}
      notas.forEach(n => { tituloPorId[n.titulo.normalize('NFC').toLowerCase()] = n.id })

      // contar conexões e montar arestas
      const conexoes = {}
      notas.forEach(n => { conexoes[n.id] = 0 })
      const rawLinks = []
      const vistas = new Set()

      notas.forEach(nota => {
        ;(nota.wikilinks ?? []).forEach(titulo => {
          const alvoId = tituloPorId[titulo]
          if (alvoId && alvoId !== nota.id) {
            const chave = [nota.id, alvoId].sort().join('__')
            if (!vistas.has(chave)) {
              vistas.add(chave)
              rawLinks.push({ id: chave, source: nota.id, target: alvoId })
              conexoes[nota.id] = (conexoes[nota.id] || 0) + 1
              conexoes[alvoId] = (conexoes[alvoId] || 0) + 1
            }
          }
        })
      })

      // Mapa de adjacência para hover highlight
      const adjacency = new Map()
      rawLinks.forEach(a => {
        if (!adjacency.has(a.source)) adjacency.set(a.source, new Set())
        if (!adjacency.has(a.target)) adjacency.set(a.target, new Set())
        adjacency.get(a.source).add(a.target)
        adjacency.get(a.target).add(a.source)
      })

      // Preparar nós para d3-force
      const corDoNo = (nota) => {
        if (nota.hemisphere === 'machine') return machineNodeColor()
        // Custom groups have priority
        for (const grupo of grupos) {
          if (!grupo.query) continue
          const q = grupo.query
          let match = false
          if (q.startsWith('path:')) {
            const termo = q.slice(5).toLowerCase().trim()
            const path = (nota.fullPath || nota.caderno || '').toLowerCase()
            match = path.includes(termo)
          } else if (q.startsWith('section:')) {
            const termo = q.slice(8).toLowerCase().trim()
            match = nota.wikilinks?.some(link => link.includes(termo)) ||
                    nota.titulo?.toLowerCase().includes(termo)
          } else {
            const termo = q.toLowerCase()
            match = nota.caderno?.toLowerCase().includes(termo) ||
                    nota.titulo?.toLowerCase().includes(termo)
          }
          if (match) return grupo.cor
        }
        // Automatic color by caderno — deterministic hash
        if (config.colorByCaderno) return corPorCaderno(nota.caderno)
        return COR_PADRAO
      }
      const simNodes = notas.map(nota => {
        // Path completo: caderno/subpasta (para match com path:)
        const fullPath = nota.subpasta ? `${nota.caderno}/${nota.subpasta}` : nota.caderno
        return {
          id: nota.id,
          titulo: nota.titulo,
          caderno: nota.caderno,
          subpasta: nota.subpasta || null,
          fullPath,
          tags: nota.tags || [],
          conexoes: conexoes[nota.id] || 0,
          cor: corDoNo({ ...nota, fullPath }),
          editadaEm: nota.editadaEm,
          isIsolado: (conexoes[nota.id] || 0) === 0,
          wikilinks: nota.wikilinks ?? [],
        }
      })

      // Filtrar isolados se necessário + filtrar links correspondentes
      const filteredNodes = config.showIsolados ? simNodes : simNodes.filter(d => !d.isIsolado)
      const nodeIds = new Set(filteredNodes.map(n => n.id))
      const simLinks = rawLinks
        .filter(l => nodeIds.has(l.source) && nodeIds.has(l.target))
        .map(l => ({ ...l })) // clone para d3 não mutar rawLinks

      graphDataRef.current = { simNodes: filteredNodes, simLinks, adjacency, rawLinks }
      // Sugestões para autocomplete: cadernos + paths completos + títulos
      const todasSugestoes = new Set()
      simNodes.forEach(n => {
        if (n.caderno) todasSugestoes.add(n.caderno)
        if (n.fullPath && n.fullPath !== n.caderno) todasSugestoes.add(n.fullPath)
        if (n.titulo) todasSugestoes.add(n.titulo)
      })
      const sugestoes = [...todasSugestoes].sort()
      cadernosRef.current = sugestoes
      setListaCadernos(sugestoes)
      setStats({ notas: notas.length, arestas: simLinks.length })

      // Stop old simulation
      if (simRef.current) simRef.current.stop()

      // Esperar o SVG existir no DOM (loading vai mudar para false)
      if (cancelled) return

      // ── Inicializar zoom (uma vez) ─────────────────────────────────────────
      if (!zoomInitialized.current && svgRef.current && gRef.current) {
        const svg = select(svgRef.current)
        const gEl = select(gRef.current)
        const updateLabelVisibility = (transform) => {
          const k = transform?.k ?? 1
          gEl.selectAll('text.label, text.label-halo')
            .style('opacity', (d) => {
              const conn = d.conexoes ?? 0
              const minZoom = Math.max(0.15, 0.6 - conn * 0.025)
              if (k < minZoom) return 0
              if (k < minZoom + 0.2) return (k - minZoom) / 0.2
              return 1
            })
        }
        updateLabelVisibilityRef.current = updateLabelVisibility
        const zoomBehavior = d3Zoom()
          .scaleExtent([0.1, 4])
          .on('zoom', (event) => {
            gEl.attr('transform', event.transform)
            updateLabelVisibility(event.transform)
          })
        svg.call(zoomBehavior)
        svg.on('dblclick.zoom', null)
        zoomRef.current = zoomBehavior
        zoomInitialized.current = true
      }

      // ── Renderizar SVG via d3 ──────────────────────────────────────────────
      const g = select(gRef.current)
      if (!g.node()) { setLoading(false); return }
      g.selectAll('*').remove()

      // Edges
      const linkSel = g.selectAll('line.edge')
        .data(simLinks)
        .enter().append('line')
        .attr('class', 'edge')
        .style('stroke', `rgba(180,170,155,${config.linkOpacity})`)
        .style('stroke-width', config.linkWidth)

      // Nós (grupo com círculo + label)
      const nodeSel = g.selectAll('g.node')
        .data(filteredNodes, d => d.id)
        .enter().append('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')

      nodeSel.append('circle')
        .attr('r', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2)
        .style('fill', d => d.cor || 'rgba(155,148,138,0.85)')
        .style('opacity', d => d.isIsolado ? 0.4 : 1)

      if (config.showLabels && filteredNodes.length <= LABEL_THRESHOLD) {
        nodeSel.append('text')
          .attr('class', 'label-halo')
          .text(d => d.titulo)
          .attr('dy', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2 + config.labelSize + 2)
          .attr('text-anchor', 'middle')
          .style('font-size', config.labelSize + 'px')
          .style('stroke', 'rgba(10,9,8,0.85)')
          .style('stroke-width', 3)
          .style('fill', 'none')
          .style('pointer-events', 'none')
          .style('font-family', 'inherit')
        nodeSel.append('text')
          .attr('class', 'label')
          .text(d => d.titulo)
          .attr('dy', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2 + config.labelSize + 2)
          .attr('text-anchor', 'middle')
          .style('font-size', config.labelSize + 'px')
          .style('fill', 'rgba(200,192,178,0.6)')
          .style('pointer-events', 'none')
          .style('font-family', 'inherit')
      }

      // Save selections for visual update effects
      linkSelRef.current = linkSel
      nodeSelRef.current = nodeSel

      // ── Hover highlight (transições suaves) ─────────────────────────────
      nodeSel
        .on('mouseenter', function(event, d) {
          if (isDragging.current) return
          const vizinhos = adjacency.get(d.id)
          // Escala o nó hovereado
          select(this).select('circle').transition().duration(80)
            .attr('r', (config.nodeSize + Math.sqrt(d.conexoes) * 1.2) * 1.3)
          // Dim nós com transição
          nodeSel.transition().duration(80)
            .style('opacity', n => {
              if (n.id === d.id) return 1
              if (vizinhos?.has(n.id)) return 0.9
              return 0.08
            })
          // Edges com transição — conectadas ficam vermelhas
          linkSel.transition().duration(80)
            .style('stroke', l => {
              const sId = typeof l.source === 'object' ? l.source.id : l.source
              const tId = typeof l.target === 'object' ? l.target.id : l.target
              return (sId === d.id || tId === d.id) ? '#e05c5c' : 'rgba(180,170,155,0.03)'
            })
            .style('stroke-opacity', l => {
              const sId = typeof l.source === 'object' ? l.source.id : l.source
              const tId = typeof l.target === 'object' ? l.target.id : l.target
              return (sId === d.id || tId === d.id) ? 1 : 0.1
            })
            .style('stroke-width', l => {
              const sId = typeof l.source === 'object' ? l.source.id : l.source
              const tId = typeof l.target === 'object' ? l.target.id : l.target
              return (sId === d.id || tId === d.id) ? config.linkWidth * 2 : config.linkWidth
            })
          // Label on hover for many nodes
          if (config.showLabels && filteredNodes.length > LABEL_THRESHOLD) {
            if (select(event.currentTarget).select('text.hover-label').empty()) {
              const base = config.nodeSize + Math.sqrt(d.conexoes) * 1.2
              select(event.currentTarget).append('text')
                .attr('class', 'hover-label')
                .text(d.titulo)
                .attr('dy', base + config.labelSize + 2)
                .attr('text-anchor', 'middle')
                .style('font-size', config.labelSize + 'px')
                .style('fill', 'rgba(220,215,205,1.0)')
                .style('pointer-events', 'none')
            }
          }
        })
        .on('mouseleave', function(event, d) {
          if (isDragging.current) return
          // Volta ao tamanho normal
          select(this).select('circle').transition().duration(80)
            .attr('r', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2)
          // Volta tudo ao normal
          nodeSel.transition().duration(80)
            .style('opacity', n => n.isIsolado ? 0.4 : 1)
          linkSel.transition().duration(80)
            .style('stroke', `rgba(180,170,155,${config.linkOpacity})`)
            .style('stroke-opacity', 1)
            .style('stroke-width', config.linkWidth)
          g.selectAll('text.hover-label').remove()
        })

      // Click no fundo fecha painel
      select(svgRef.current).on('click.deselect', () => setNotaSelecionada(null))

      // ── Double click: liberar nó imediatamente ──────────────────────────
      nodeSel.on('dblclick', (event, d) => {
        event.stopPropagation()
        d.fx = null
        d.fy = null
        if (simRef.current) simRef.current.alpha(0.3).restart()
      })

      // ── Drag nativo d3 (com distinção clique vs drag) ─────────────────────
      let dragMoved = false
      const drag = d3Drag()
        .on('start', function(event, d) {
          dragMoved = false
          isDragging.current = true
          select(this).style('cursor', 'grabbing')
          if (!event.active) simRef.current?.alphaTarget(0.4).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          dragMoved = true
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', function(event, d) {
          isDragging.current = false
          select(this).style('cursor', 'pointer')
          if (!event.active) simRef.current?.alphaTarget(0)

          // Reset highlight immediately on drag end
          select(this).select('circle')
            .attr('r', config.nodeSize + Math.sqrt(d.conexoes) * 1.2)
          nodeSel.style('opacity', n => n.isIsolado ? 0.4 : 1)
          linkSel
            .style('stroke', `rgba(180,170,155,${config.linkOpacity})`)
            .style('stroke-opacity', 1)
            .style('stroke-width', config.linkWidth)
          g.selectAll('text.hover-label').remove()

          // Se não moveu = foi clique = abre nota
          if (!dragMoved) {
            d.fx = null
            d.fy = null
            window.dispatchEvent(new CustomEvent('paraverso:abrir-em-notas', {
              detail: { nota: { id: d.id, titulo: d.titulo, caderno: d.caderno } }
            }))
          } else {
            d.fx = null
            d.fy = null
            simRef.current?.alpha(0.15).restart()
          }
        })
      nodeSel.call(drag)

      // ── Pré-posicionar nós em círculo (evita flick ao abrir) ─────────────
      const w = containerRef.current?.offsetWidth ?? 800
      const h = containerRef.current?.offsetHeight ?? 600
      const total = filteredNodes.length
      filteredNodes.forEach((n, i) => {
        const angle = (i / total) * 2 * Math.PI
        const radius = Math.min(w, h) * 0.25
        n.x = Math.cos(angle) * radius
        n.y = Math.sin(angle) * radius
      })

      // Zoom inicial sem animação (centro)
      if (zoomRef.current && svgRef.current) {
        select(svgRef.current).call(
          zoomRef.current.transform,
          zoomIdentity.translate(w / 2, h / 2).scale(1)
        )
      }

      // ── Force simulation (Obsidian-like) ─────────────────────────────────
      const sim = forceSimulation(filteredNodes)
        .force('link', forceLink(simLinks).id(d => d.id)
          .distance(config.linkDistance)
          .strength(d => {
            const sc = (typeof d.source === 'object' ? d.source.conexoes : 0) ?? 0
            const tc = (typeof d.target === 'object' ? d.target.conexoes : 0) ?? 0
            return 0.3 + Math.min(Math.max(sc, tc), 15) * 0.02
          })
        )
        .force('charge', forceManyBody()
          .strength(config.repulsion)
          .distanceMax(400)
          .distanceMin(10)
        )
        .force('x', forceX(0).strength(config.gravity))
        .force('y', forceY(0).strength(config.gravity))
        .force('collide', forceCollide(d => config.nodeSize + Math.sqrt(d.conexoes ?? 0) * 1.2 + 2))
        .force('gravity', alpha => {
          // Força que aumenta com distância — nós longe são puxados mais forte
          filteredNodes.forEach(n => {
            if (n.fx != null) return
            const dx = -n.x
            const dy = -n.y
            const dist = Math.sqrt(dx * dx + dy * dy)
            const str = alpha * 0.008 * (dist / 100)
            n.vx += dx * str
            n.vy += dy * str
          })
        })
        .alphaDecay(0.028)
        .velocityDecay(0.55)

      sim.on('tick', () => {
        if (cancelled) return
        linkSel
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y)
        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`)
      })

      sim.on('end', () => {
        if (cancelled) return
        updateLabelVisibilityRef.current?.(null)
        // Fit view suave após simulation estabilizar
        const xs = filteredNodes.map(n => n.x)
        const ys = filteredNodes.map(n => n.y)
        const minX = Math.min(...xs), maxX = Math.max(...xs)
        const minY = Math.min(...ys), maxY = Math.max(...ys)
        const gw = maxX - minX || 1, gh = maxY - minY || 1
        const pad = 60
        const scale = Math.min((w - pad * 2) / gw, (h - pad * 2) / gh, 1.5)
        const tx = w / 2 - (minX + gw / 2) * scale
        const ty = h / 2 - (minY + gh / 2) * scale
        if (zoomRef.current && svgRef.current) {
          select(svgRef.current).transition().duration(600).call(
            zoomRef.current.transform,
            zoomIdentity.translate(tx, ty).scale(scale)
          )
        }
      })

      simRef.current = sim
      setLoading(false)
      updateLabelVisibilityRef.current?.(null)
    }

    construirGrafo()
    return () => {
      cancelled = true
      if (simRef.current) simRef.current.stop()
    }
  }, [dark, vaultPath, config.colorByCaderno, config.showIsolados, grupos]) // eslint-disable-line

  // ── useEffect B — Atualizar visual sem recriar simulation ─────────────────
  useEffect(() => {
    const linkSel = linkSelRef.current
    const nodeSel = nodeSelRef.current
    if (!linkSel || !nodeSel) return

    // Atualizar circle radius
    nodeSel.select('circle')
      .attr('r', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2)

    // Atualizar labels (halo + label)
    nodeSel.selectAll('text.label-halo, text.label')
      .style('font-size', config.labelSize + 'px')
      .attr('dy', d => config.nodeSize + Math.sqrt(d.conexoes) * 1.2 + config.labelSize + 2)

    // Atualizar edges
    const corAresta = `rgba(180,170,155,${config.linkOpacity})`
    linkSel
      .style('stroke', corAresta)
      .style('stroke-width', config.linkWidth)
  }, [config.nodeSize, config.labelSize, config.linkWidth, config.linkOpacity, dark])

  // ── useEffect C — Atualizar física sem recriar simulation ─────────────────
  useEffect(() => {
    const sim = simRef.current
    if (!sim) return

    sim.force('charge')?.strength(config.repulsion)
    sim.force('link')?.distance(config.linkDistance)
    sim.force('x')?.strength(config.gravity)
    sim.force('y')?.strength(config.gravity)
    sim.force('collide')?.radius(d => config.nodeSize + Math.sqrt(d.conexoes ?? 0) * 1.2 + 2)

    sim.alpha(0.3).restart()
  }, [config.repulsion, config.linkDistance, config.gravity, config.nodeSize])

  // ── Busca: centraliza no nó encontrado ────────────────────────────────────
  const handleBusca = useCallback((query) => {
    if (!query || !svgRef.current || !zoomRef.current) return
    const qNorm = query.normalize('NFC').toLowerCase()
    const { simNodes } = graphDataRef.current
    const found = simNodes.find(n => n.titulo?.normalize('NFC').toLowerCase().includes(qNorm))
    if (found && found.x != null) {
      const w = containerRef.current?.offsetWidth ?? 800
      const h = containerRef.current?.offsetHeight ?? 600
      select(svgRef.current).transition().duration(400).call(
        zoomRef.current.transform,
        zoomIdentity.translate(w / 2, h / 2).scale(2).translate(-found.x, -found.y)
      )
      setNotaSelecionada(found)
    }
  }, [])

  const bgColor = dark ? '#1a1a1a' : '#F2EDE4'
  const panelStyle = {
    background: dark ? '#1c1c1c' : '#FAF6EF',
    border: `0.5px solid ${dark ? '#2a2a2a' : '#D5CFC4'}`,
    borderRadius: 8,
    fontSize: 11,
    color: dark ? '#888880' : '#6B5E4A',
  }
  const topOffset = window.electron ? 48 : 12

  // SVG está SEMPRE presente — sem early return antes do JSX principal
  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: bgColor }}>
      <div ref={containerRef} style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        {/* SVG sempre presente no DOM */}
        <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block', background: bgColor }}>
          <g ref={gRef} />
          {/* Loading text dentro do SVG */}
          {loading && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
              style={{ fill: dark ? '#888880' : '#6B5E4A', fontSize: 14 }}>
              Construindo grafo…
            </text>
          )}
          {/* Empty state */}
          {!loading && stats.notas === 0 && (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
              style={{ fill: dark ? '#888880' : '#6B5E4A', fontSize: 13 }}>
              Nenhuma nota ainda. Use [[wikilinks]] para conectar notas.
            </text>
          )}
        </svg>

        {/* Busca + Config — posicionados absolutos sobre o SVG */}
        {!loading && stats.notas > 0 && (
          <div style={{ position: 'absolute', top: topOffset, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ ...panelStyle, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={buscaQuery}
                onChange={e => setBuscaQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleBusca(buscaQuery) }}
                placeholder="Buscar nota…"
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: dark ? '#d4cfc9' : '#1A1A18',
                  fontSize: 11,
                  width: 120,
                }}
              />
              {buscaQuery && (
                <button
                  onClick={() => setBuscaQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: dark ? '#888880' : '#6B5E4A', fontSize: 11 }}
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => setConfigOpen(v => !v)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: configOpen ? ('#e4e4e4') : (dark ? '#888880' : '#6B5E4A'),
                  fontSize: 13, lineHeight: 1, padding: '0 2px',
                }}
                title="Configurações do grafo"
              >
                ⚙
              </button>
            </div>

            {configOpen && (
              <div style={{
                ...panelStyle,
                padding: '10px 14px',
                width: 260,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <ConfigSection title="Nós" open={openSections.nos} onToggle={() => setOpenSections(s => ({ ...s, nos: !s.nos }))}>
                  <ConfigSlider label="Tamanho" value={config.nodeSize} min={2} max={16} step={1} onChange={v => updateConfig('nodeSize', v)} dark={dark} />
                  <ConfigSlider label="Label" value={config.labelSize} min={6} max={16} step={1} onChange={v => updateConfig('labelSize', v)} dark={dark} />
                </ConfigSection>

                <ConfigSection title="Arestas" open={openSections.arestas} onToggle={() => setOpenSections(s => ({ ...s, arestas: !s.arestas }))}>
                  <ConfigSlider label="Espessura" value={config.linkWidth} min={0.2} max={3} step={0.1} onChange={v => updateConfig('linkWidth', Math.round(v * 10) / 10)} dark={dark} />
                  <ConfigSlider label="Opacidade" value={config.linkOpacity} min={0.05} max={1} step={0.05} onChange={v => updateConfig('linkOpacity', Math.round(v * 100) / 100)} dark={dark} />
                </ConfigSection>

                <ConfigSection title="Física" open={openSections.fisica} onToggle={() => setOpenSections(s => ({ ...s, fisica: !s.fisica }))}>
                  <ConfigSlider label="Repulsão" value={config.repulsion} min={-500} max={-10} step={10} onChange={v => updateConfig('repulsion', v)} dark={dark} />
                  <ConfigSlider label="Distância" value={config.linkDistance} min={20} max={300} step={10} onChange={v => updateConfig('linkDistance', v)} dark={dark} />
                  <ConfigSlider label="Gravidade" value={config.gravity} min={0} max={1} step={0.05} onChange={v => updateConfig('gravity', Math.round(v * 100) / 100)} dark={dark} />
                </ConfigSection>

                <ConfigSection title="Exibição" open={openSections.exibicao} onToggle={() => setOpenSections(s => ({ ...s, exibicao: !s.exibicao }))}>
                  <ConfigToggle label="Mostrar labels" checked={config.showLabels} onChange={v => updateConfig('showLabels', v)} dark={dark} />
                  <ConfigToggle label="Cor por caderno" checked={config.colorByCaderno} onChange={v => updateConfig('colorByCaderno', v)} dark={dark} />
                  <ConfigToggle label="Mostrar isolados" checked={config.showIsolados} onChange={v => updateConfig('showIsolados', v)} dark={dark} />
                </ConfigSection>

                <ConfigSection title="Grupos de cor" open={openSections.grupos} onToggle={() => setOpenSections(s => ({ ...s, grupos: !s.grupos }))}>
                  {grupos.map(g => (
                    <GrupoItem
                      key={g.id}
                      grupo={g}
                      cadernos={listaCadernos}
                      onUpdate={updated => setGrupos(prev => prev.map(x => x.id === g.id ? updated : x))}
                      onRemove={id => setGrupos(prev => prev.filter(x => x.id !== id))}
                    />
                  ))}
                  <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation()
                      setGrupos(prev => [...prev, { id: Date.now(), query: '', cor: GRUPO_CORES[prev.length % GRUPO_CORES.length] }])
                    }}
                    style={{
                      width: '100%', padding: '6px 0',
                      background: 'rgba(255,255,255,0.07)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 6, color: 'rgba(255,255,255,0.7)',
                      fontSize: 12, cursor: 'pointer', marginTop: 4,
                    }}
                  >+ Adicionar grupo</button>
                </ConfigSection>
              </div>
            )}
          </div>
        )}

        {/* Legenda + stats */}
        {!loading && stats.notas > 0 && (
          <div style={{ position: 'absolute', top: topOffset, left: 12, zIndex: 10 }}>
            <div style={{ ...panelStyle, padding: '8px 12px' }}>
              <div style={{ marginBottom: 6, fontWeight: 500, color: dark ? '#d4cfc9' : '#1A1A18', fontSize: 12 }}>
                {stats.notas} nota{stats.notas !== 1 ? 's' : ''}
                {stats.arestas > 0 && ` · ${stats.arestas} ligaç${stats.arestas !== 1 ? 'ões' : 'ão'}`}
              </div>
              {grupos.filter(g => g.query).map(g => [g.query, g.cor]).map(([nome, cor]) => (
                <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                  <span>{nome}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, opacity: 0.6, fontSize: 10 }}>
                Arraste para fixar · Duplo clique para liberar
              </div>
            </div>
          </div>
        )}
      </div>

      {/* painel da nota selecionada */}
      {notaSelecionada && (
        <div className="w-60 flex-shrink-0 bg-surface dark:bg-surface-dark flex flex-col p-4 gap-3 overflow-auto">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-base font-medium text-ink dark:text-ink-dark leading-snug">
              {notaSelecionada.titulo}
            </h3>
            <button
              onClick={() => setNotaSelecionada(null)}
              className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark flex-shrink-0 mt-0.5"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: notaSelecionada.cor }} />
            <span className="text-xs text-ink-3 dark:text-ink-dark3">{notaSelecionada.caderno}</span>
          </div>

          <div className="text-xs text-ink-3 dark:text-ink-dark3 space-y-1">
            <div>{notaSelecionada.conexoes} ligaç{notaSelecionada.conexoes !== 1 ? 'ões' : 'ão'}</div>
            {notaSelecionada.editadaEm > 0 && (
              <div>
                Editada{' '}
                {new Date(notaSelecionada.editadaEm).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </div>
            )}
          </div>

          {notaSelecionada.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {notaSelecionada.tags.map(t => (
                <span key={t} className="hashtag text-xs">#{t}</span>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('paraverso:abrir-em-notas', {
                detail: { nota: { id: notaSelecionada.id, titulo: notaSelecionada.titulo, caderno: notaSelecionada.caderno } }
              }))
              setNotaSelecionada(null)
            }}
            className="mt-auto pt-3 border-t border-bdr-2 dark:border-bdr-dark2 text-xs text-accent dark:text-accent-dark hover:underline text-left cursor-pointer"
            style={{ background: 'none', border: 'none', borderTop: '1px solid', padding: '12px 0 0' }}
          >
            Abrir nota →
          </button>
        </div>
      )}
    </div>
  )
}
