import { useState, useEffect, useRef, useCallback } from 'react'
import { getTodasNotas, getTodosMeses } from '../../db/index'
import { useVault } from '../../contexts/VaultContext'

// Extrai texto puro de um conteúdo TipTap (JSON de blocos)
function extrairTexto(conteudo) {
  if (!conteudo) return ''
  if (typeof conteudo === 'string') return conteudo
  try {
    function walkNodes(node) {
      if (!node) return ''
      if (node.type === 'text') return node.text || ''
      if (node.type === 'wikilink') return node.attrs?.titulo || ''
      if (node.type === 'hashtag') return `#${node.attrs?.tag || ''}`
      if (node.content) return node.content.map(walkNodes).join(' ')
      return ''
    }
    return walkNodes(conteudo)
  } catch {
    return ''
  }
}

// Destaca o trecho com o termo buscado
function Highlight({ texto, termo }) {
  if (!termo || !texto) return <span>{texto}</span>
  const idx = texto.toLowerCase().indexOf(termo.toLowerCase())
  if (idx === -1) return <span>{texto}</span>
  return (
    <span>
      {texto.slice(0, idx)}
      <mark className="bg-accent/20 dark:bg-accent-dark/20 text-accent dark:text-accent-dark rounded px-0.5 not-italic font-medium">
        {texto.slice(idx, idx + termo.length)}
      </mark>
      {texto.slice(idx + termo.length)}
    </span>
  )
}

// Pega um trecho de ~120 chars ao redor do match
function trechoAoRedor(texto, termo, janela = 80) {
  if (!texto || !termo) return texto?.slice(0, 120) || ''
  const idx = texto.toLowerCase().indexOf(termo.toLowerCase())
  if (idx === -1) return texto.slice(0, 120)
  const inicio = Math.max(0, idx - janela)
  const fim = Math.min(texto.length, idx + termo.length + janela)
  return (inicio > 0 ? '…' : '') + texto.slice(inicio, fim) + (fim < texto.length ? '…' : '')
}

const NOMES_MES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

function badgeTipo(tipo) {
  const cfg = {
    nota: { label: 'Nota', cls: 'bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark' },
    dia:  { label: 'Dia',  cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    meta: { label: 'Meta', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  }
  const { label, cls } = cfg[tipo] || cfg.nota
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {label}
    </span>
  )
}

export function BuscaTab() {
  const { vaultPath } = useVault()
  const [termo, setTermo]       = useState('')
  const [filtro, setFiltro]     = useState('tudo') // tudo | nota | dia | meta
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro]         = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef   = useRef(null)
  const debounceRef = useRef(null)
  const resultRefs  = useRef([])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Quando o vault muda, limpa os resultados anteriores (eram de outra fonte)
  useEffect(() => {
    setResultados([])
    setSelectedIdx(-1)
  }, [vaultPath])

  // Reset seleção quando os resultados mudam
  useEffect(() => {
    setSelectedIdx(-1)
  }, [resultados])

  // Scroll automático para o item selecionado
  useEffect(() => {
    if (selectedIdx >= 0 && resultRefs.current[selectedIdx]) {
      resultRefs.current[selectedIdx].scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx])

  const buscar = useCallback(async (q, tipo) => {
    if (!q.trim()) { setResultados([]); setErro(null); return }
    setBuscando(true)
    setErro(null)

    try {
      const lower = q.toLowerCase()
      const encontrados = []

      // ── Notas ──
      if (tipo === 'tudo' || tipo === 'nota') {
        const notas = await getTodasNotas().catch(() => [])
        for (const nota of notas) {
          try {
            const textoConteudo = extrairTexto(nota.conteudo)
            const matchTitulo   = nota.titulo?.toLowerCase().includes(lower)
            const matchConteudo = textoConteudo.toLowerCase().includes(lower)
            if (matchTitulo || matchConteudo) {
              encontrados.push({
                id: `nota-${nota.id}`,
                tipo: 'nota',
                titulo: nota.titulo,
                subtitulo: nota.caderno,
                trecho: matchConteudo ? trechoAoRedor(textoConteudo, q) : nota.titulo,
                editadaEm: nota.editadaEm,
                dados: nota,
              })
            }
          } catch { /* skip nota com conteúdo inválido */ }
        }
      }

      // ── Dias do mês ──
      if (tipo === 'tudo' || tipo === 'dia') {
        const meses = await getTodosMeses().catch(() => [])
        for (const mes of meses) {
          for (const dia of mes.dias || []) {
            try {
              const haystack = `${dia.memo || ''} ${dia.nota || ''}`.toLowerCase()
              if (haystack.includes(lower)) {
                const texto = `${dia.memo || ''} ${dia.nota || ''}`.trim()
                encontrados.push({
                  id: `dia-${mes.id}-${dia.n}`,
                  tipo: 'dia',
                  titulo: `${dia.n} de ${NOMES_MES[(mes.mes || 1) - 1]} ${mes.ano}`,
                  subtitulo: dia.letraDia || '',
                  trecho: trechoAoRedor(texto, q),
                  editadaEm: 0,
                  dados: { mes, dia },
                })
              }
            } catch { /* skip dia inválido */ }
          }
        }
      }

      // ── Metas ──
      if (tipo === 'tudo' || tipo === 'meta') {
        const meses = await getTodosMeses().catch(() => [])
        for (const mes of meses) {
          for (const cat of mes.metas || []) {
            for (const item of cat.itens || []) {
              try {
                if (item.texto?.toLowerCase().includes(lower)) {
                  encontrados.push({
                    id: `meta-${mes.id}-${cat.id}-${item.texto}`,
                    tipo: 'meta',
                    titulo: item.texto,
                    subtitulo: `${cat.categoria} · ${NOMES_MES[(mes.mes || 1) - 1]} ${mes.ano}`,
                    trecho: item.texto,
                    editadaEm: 0,
                    dados: { mes, cat, item },
                    feito: item.feito,
                  })
                }
              } catch { /* skip meta inválida */ }
            }
          }
        }
      }

      // Ordena por relevância: match exato de título > match parcial de título > match de conteúdo
      function relevanciaNota(r) {
        if (r.tipo !== 'nota') return 0
        const t = (r.titulo || '').toLowerCase()
        if (t === lower) return 3
        if (t.startsWith(lower)) return 2
        if (t.includes(lower)) return 1
        return 0
      }
      encontrados.sort((a, b) => {
        const diff = relevanciaNota(b) - relevanciaNota(a)
        if (diff !== 0) return diff
        return (b.editadaEm || 0) - (a.editadaEm || 0)
      })
      setResultados(encontrados)
    } catch (e) {
      console.error('BuscaTab erro:', e)
      setErro('Erro ao buscar. Tente novamente.')
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }, [])

  function onChange(e) {
    const q = e.target.value
    setTermo(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(q, filtro), 180)
  }

  function onFiltro(f) {
    setFiltro(f)
    if (termo.trim()) buscar(termo, f)
  }

  // ── Ações de resultado ─────────────────────────────────────────────────────

  function abrirResultado(r) {
    if (r.tipo === 'nota') {
      window.dispatchEvent(
        new CustomEvent('paraverso:abrir-em-notas', { detail: { nota: r.dados } })
      )
    }
  }

  function criarNotaNova() {
    const titulo = termo.trim()
    if (!titulo) return
    // Sinaliza para NotasTab criar a nota e navegar para ela
    window.dispatchEvent(
      new CustomEvent('paraverso:abrir-em-notas', {
        detail: { nota: { titulo, _criar: true } }
      })
    )
  }

  // ── Navegação por teclado ──────────────────────────────────────────────────

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (resultados.length === 0) return
      setSelectedIdx(prev =>
        prev < resultados.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (resultados.length === 0) return
      setSelectedIdx(prev =>
        prev > 0 ? prev - 1 : resultados.length - 1
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx >= 0 && resultados[selectedIdx]) {
        // Abre o resultado selecionado pela seta
        abrirResultado(resultados[selectedIdx])
      } else if (resultados.length > 0) {
        // Nenhum item selecionado pela seta → abre o primeiro resultado
        abrirResultado(resultados[0])
      } else if (termo.trim()) {
        // Nenhum resultado → cria nova nota com esse título
        criarNotaNova()
      }
    } else if (e.key === 'Escape') {
      setTermo('')
      setResultados([])
      setSelectedIdx(-1)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const semResultados = termo && !buscando && resultados.length === 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg dark:bg-bg-dark">
      {/* barra de busca */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-bdr dark:border-bdr-dark bg-surface dark:bg-surface-dark">
        <div className="relative max-w-2xl mx-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 dark:text-ink-dark3 text-sm select-none">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={termo}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Buscar notas, dias, metas… (Enter para criar se não existir)"
            className="w-full bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg pl-8 pr-4 py-2.5 text-sm text-ink dark:text-ink-dark placeholder-ink-3/60 dark:placeholder-ink-dark3/60 focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
          />
          {termo && (
            <button
              onClick={() => { setTermo(''); setResultados([]); setSelectedIdx(-1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* filtros */}
        <div className="flex gap-1.5 mt-3 max-w-2xl mx-auto">
          {[
            { id: 'tudo', label: 'Tudo' },
            { id: 'nota', label: 'Notas' },
            { id: 'dia',  label: 'Dias'  },
            { id: 'meta', label: 'Metas' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => onFiltro(f.id)}
              className={`text-xs px-3 py-1 rounded-full transition-colors border ${
                filtro === f.id
                  ? 'bg-accent dark:bg-accent-dark text-white border-accent dark:border-accent-dark'
                  : 'text-ink-3 dark:text-ink-dark3 border-bdr dark:border-bdr-dark hover:border-accent/50 dark:hover:border-accent-dark/50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* resultados */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="max-w-2xl mx-auto space-y-2">

          {/* estado vazio */}
          {!termo && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <span className="text-4xl opacity-20 text-ink-3 dark:text-ink-dark3">⌕</span>
              <p className="text-sm text-ink-3 dark:text-ink-dark3">
                Busca em todas as notas, dias do mês e metas
              </p>
              <p className="text-xs text-ink-3/60 dark:text-ink-dark3/60">
                ↑↓ para navegar · Enter para abrir ou criar
              </p>
            </div>
          )}

          {/* erro */}
          {erro && (
            <div className="flex items-center gap-2 py-4 px-3 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
              <span>⚠</span> {erro}
            </div>
          )}

          {/* buscando */}
          {termo && buscando && (
            <p className="text-xs text-ink-3 dark:text-ink-dark3 py-8 text-center">Buscando…</p>
          )}

          {/* sem resultados — mostra opção de criar */}
          {semResultados && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <p className="text-sm text-ink-3 dark:text-ink-dark3">
                Nenhum resultado para <span className="text-ink dark:text-ink-dark font-medium">"{termo}"</span>
              </p>
              <button
                onClick={criarNotaNova}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-accent/30 dark:border-accent-dark/30 text-accent dark:text-accent-dark hover:bg-accent/5 dark:hover:bg-accent-dark/5 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Criar nota "{termo}"
                <span className="text-xs opacity-50 font-mono">↵</span>
              </button>
            </div>
          )}

          {/* contagem */}
          {resultados.length > 0 && (
            <p className="text-xs text-ink-3/60 dark:text-ink-dark3/60 pb-1">
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
              <span className="ml-2 opacity-60">· ↑↓ navegar · Enter abrir</span>
            </p>
          )}

          {/* lista de resultados */}
          {resultados.map((r, idx) => (
            <div
              key={r.id}
              ref={el => { resultRefs.current[idx] = el }}
              onClick={() => abrirResultado(r)}
              className={`group border rounded-lg px-4 py-3 transition-colors ${
                r.tipo === 'nota' ? 'cursor-pointer' : 'cursor-default'
              } ${
                idx === selectedIdx
                  ? 'bg-accent/8 dark:bg-accent-dark/8 border-accent/40 dark:border-accent-dark/40'
                  : 'bg-surface dark:bg-surface-dark border-bdr dark:border-bdr-dark hover:border-accent/40 dark:hover:border-accent-dark/40'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  {/* tipo + título */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {badgeTipo(r.tipo)}
                    <span className={`text-sm font-medium text-ink dark:text-ink-dark truncate ${r.feito ? 'line-through opacity-50' : ''}`}>
                      <Highlight texto={r.titulo} termo={termo} />
                    </span>
                  </div>

                  {/* subtítulo (caderno / mês) */}
                  {r.subtitulo && (
                    <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">
                      {r.subtitulo}
                    </p>
                  )}

                  {/* trecho com highlight */}
                  {r.trecho && r.trecho !== r.titulo && (
                    <p className="text-xs text-ink-2 dark:text-ink-dark2 mt-1.5 leading-relaxed line-clamp-2">
                      <Highlight texto={r.trecho} termo={termo} />
                    </p>
                  )}
                </div>

                {/* data (notas) */}
                {r.editadaEm > 0 && (
                  <span className="text-[10px] text-ink-3/50 dark:text-ink-dark3/50 flex-shrink-0 mt-0.5">
                    {new Date(r.editadaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
