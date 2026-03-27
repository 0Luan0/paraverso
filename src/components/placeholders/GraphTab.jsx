import { useEffect, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { db } from '../../db/index'

// ── Cores por caderno ──
const CADERNO_COR = {
  Pensamentos: '#C17A3A',
  Leituras:    '#5B8A6A',
  Projetos:    '#4A7AB8',
}
function corPorCaderno(caderno) {
  return CADERNO_COR[caderno] || '#8A7A6A'
}

// ── Extrai wikilinks do JSON TipTap ──
function extrairWikilinks(conteudo) {
  if (!conteudo) return []
  const links = []
  function walk(node) {
    if (!node) return
    if (node.type === 'wikilink' && node.attrs?.titulo) links.push(node.attrs.titulo)
    if (node.content) node.content.forEach(walk)
  }
  walk(conteudo)
  return links
}

// ── Layout: clusters por caderno dispostos em círculo ──
function calcularPosicoes(notas) {
  const porCaderno = {}
  notas.forEach(n => {
    if (!porCaderno[n.caderno]) porCaderno[n.caderno] = []
    porCaderno[n.caderno].push(n)
  })

  const posicoes = {}
  const cadernos = Object.keys(porCaderno)
  const raioCluster = Math.max(260, cadernos.length * 110)

  cadernos.forEach((caderno, ci) => {
    const grupo = porCaderno[caderno]
    const anguloCluster = (ci / cadernos.length) * 2 * Math.PI - Math.PI / 2
    const cx = Math.cos(anguloCluster) * raioCluster + raioCluster + 120
    const cy = Math.sin(anguloCluster) * raioCluster + raioCluster + 80

    const raioNota = Math.max(60, grupo.length * 22)
    grupo.forEach((nota, ni) => {
      const anguloNota = (ni / grupo.length) * 2 * Math.PI
      posicoes[nota.id] = {
        x: cx + Math.cos(anguloNota) * raioNota,
        y: cy + Math.sin(anguloNota) * raioNota,
      }
    })
  })
  return posicoes
}

// ── Nó customizado ──
function NotaNode({ data, selected }) {
  const raio = 10 + Math.min((data.conexoes || 0) * 3, 20)
  return (
    <div
      style={{
        width: raio * 2,
        height: raio * 2,
        borderRadius: '50%',
        background: data.cor,
        border: selected ? '2.5px solid white' : '1.5px solid rgba(255,255,255,0.25)',
        boxShadow: selected
          ? `0 0 0 3px ${data.cor}55, 0 4px 16px rgba(0,0,0,0.35)`
          : '0 2px 8px rgba(0,0,0,0.25)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border 0.15s',
      }}
      title={data.titulo}
    />
  )
}

const nodeTypes = { nota: NotaNode }

export function GraphTab({ dark }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [notaSelecionada, setNotaSelecionada] = useState(null)
  const [stats, setStats] = useState({ notas: 0, arestas: 0 })

  useEffect(() => {
    async function construirGrafo() {
      const notas = await db.notas.toArray()
      setStats(s => ({ ...s, notas: notas.length }))

      if (notas.length === 0) { setLoading(false); return }

      // índice título → id
      const tituloPorId = {}
      notas.forEach(n => { tituloPorId[n.titulo.toLowerCase()] = n.id })

      // contar conexões e montar arestas
      const conexoes = {}
      notas.forEach(n => { conexoes[n.id] = 0 })
      const arestas = []
      const vistas = new Set()

      notas.forEach(nota => {
        extrairWikilinks(nota.conteudo).forEach(titulo => {
          const alvoId = tituloPorId[titulo.toLowerCase()]
          if (alvoId && alvoId !== nota.id) {
            const chave = [nota.id, alvoId].sort().join('__')
            if (!vistas.has(chave)) {
              vistas.add(chave)
              arestas.push({ id: chave, source: nota.id, target: alvoId })
              conexoes[nota.id] = (conexoes[nota.id] || 0) + 1
              conexoes[alvoId] = (conexoes[alvoId] || 0) + 1
            }
          }
        })
      })
      setStats({ notas: notas.length, arestas: arestas.length })

      const posicoes = calcularPosicoes(notas)
      const corAresta = dark ? 'rgba(168,152,128,0.3)' : 'rgba(139,122,94,0.3)'

      setNodes(notas.map(nota => ({
        id: nota.id,
        type: 'nota',
        position: posicoes[nota.id] || { x: Math.random() * 600, y: Math.random() * 400 },
        data: {
          titulo: nota.titulo,
          caderno: nota.caderno,
          tags: nota.tags || [],
          conexoes: conexoes[nota.id] || 0,
          cor: corPorCaderno(nota.caderno),
          editadaEm: nota.editadaEm,
        },
        style: { background: 'transparent', border: 'none', width: 'auto', height: 'auto' },
      })))

      setEdges(arestas.map(a => ({
        ...a,
        style: { stroke: corAresta, strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 5, height: 5, color: corAresta },
      })))

      setLoading(false)
    }
    construirGrafo()
  }, [dark])

  const onNodeClick = useCallback((_, node) => setNotaSelecionada(node.data), [])
  const onPaneClick = useCallback(() => setNotaSelecionada(null), [])

  const bgColor = dark ? '#1A1812' : '#F2EDE4'
  const dotColor = dark ? 'rgba(168,152,128,0.15)' : 'rgba(139,122,94,0.18)'
  const panelStyle = {
    background: dark ? '#221E16' : '#FAF6EF',
    border: `0.5px solid ${dark ? '#3A3428' : '#D5CFC4'}`,
    borderRadius: 8,
    fontSize: 11,
    color: dark ? '#A89880' : '#6B5E4A',
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg dark:bg-bg-dark">
        <span className="text-sm text-ink-3 dark:text-ink-dark3">Construindo grafo…</span>
      </div>
    )
  }

  if (stats.notas === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-bg dark:bg-bg-dark">
        <span className="text-3xl opacity-20">◎</span>
        <p className="text-sm text-ink-3 dark:text-ink-dark3 text-center max-w-xs leading-relaxed">
          Nenhuma nota ainda. Crie notas na aba <strong>Notas</strong> e use{' '}
          <code className="text-xs bg-bg-2 dark:bg-bg-dark2 px-1 rounded">[[wikilinks]]</code> para conectá-las.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: bgColor }}>
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={4}
          style={{ background: bgColor }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={dotColor} gap={22} size={1.2} variant="dots" />

          <Controls
            style={{ ...panelStyle, padding: '2px' }}
            showInteractive={false}
          />

          <MiniMap
            nodeColor={node => node.data?.cor || '#888'}
            maskColor={dark ? 'rgba(26,24,18,0.75)' : 'rgba(242,237,228,0.75)'}
            style={{ ...panelStyle }}
          />

          {/* legenda + stats */}
          <Panel position="top-left">
            <div style={{ ...panelStyle, padding: '8px 12px' }}>
              <div style={{ marginBottom: 6, fontWeight: 500, color: dark ? '#EDE8DF' : '#1A1A18', fontSize: 12 }}>
                {stats.notas} nota{stats.notas !== 1 ? 's' : ''}
                {stats.arestas > 0 && ` · ${stats.arestas} ligaç${stats.arestas !== 1 ? 'ões' : 'ão'}`}
              </div>
              {[...Object.entries(CADERNO_COR), ['Outros', '#8A7A6A']].map(([nome, cor]) => (
                <div key={nome} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                  <span>{nome}</span>
                </div>
              ))}
              <div style={{ marginTop: 8, opacity: 0.6, fontSize: 10 }}>
                Arraste para mover · Scroll para zoom
              </div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* painel da nota selecionada */}
      {notaSelecionada && (
        <div className="w-60 flex-shrink-0 border-l border-bdr dark:border-bdr-dark bg-surface dark:bg-surface-dark flex flex-col p-4 gap-3 overflow-auto">
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

          <p className="text-xs text-ink-3/50 dark:text-ink-dark3/50 mt-auto pt-3 border-t border-bdr-2 dark:border-bdr-dark2">
            Vá à aba Notas para editar esta nota
          </p>
        </div>
      )}
    </div>
  )
}
