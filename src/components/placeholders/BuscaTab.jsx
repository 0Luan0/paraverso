import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../../db/index'

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

const LETRAS_DIA = { D: 'Dom', S: 'Seg', T: 'Ter', Q: 'Qua', Q2: 'Qui', S2: 'Sex', S3: 'Sáb' }

function badgeTipo(tipo) {
  const cfg = {
    nota: { label: 'Nota', cls: 'bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark' },
    dia: { label: 'Dia', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
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
  const [termo, setTermo] = useState('')
  const [filtro, setFiltro] = useState('tudo') // tudo | nota | dia | meta
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const buscar = useCallback(async (q, tipo) => {
    if (!q.trim()) { setResultados([]); return }
    setBuscando(true)

    const lower = q.toLowerCase()
    const encontrados = []

    // ── Notas ──
    if (tipo === 'tudo' || tipo === 'nota') {
      const notas = await db.notas.toArray()
      for (const nota of notas) {
        const textoConteudo = extrairTexto(nota.conteudo)
        const matchTitulo = nota.titulo?.toLowerCase().includes(lower)
        const matchConteudo = textoConteudo.toLowerCase().includes(lower)
        if (matchTitulo || matchConteudo) {
          const trecho = matchConteudo
            ? trechoAoRedor(textoConteudo, q)
            : nota.titulo
          encontrados.push({
            id: `nota-${nota.id}`,
            tipo: 'nota',
            titulo: nota.titulo,
            subtitulo: nota.caderno,
            trecho,
            editadaEm: nota.editadaEm,
            dados: nota,
          })
        }
      }
    }

    // ── Dias do mês ──
    if (tipo === 'tudo' || tipo === 'dia') {
      const meses = await db.meses.toArray()
      for (const mes of meses) {
        for (const dia of mes.dias || []) {
          const haystack = `${dia.memo || ''} ${dia.nota || ''}`.toLowerCase()
          if (haystack.includes(lower)) {
            const texto = `${dia.memo || ''} ${dia.nota || ''}`.trim()
            encontrados.push({
              id: `dia-${mes.id}-${dia.n}`,
              tipo: 'dia',
              titulo: `${dia.n} de ${NOMES_MES[mes.mes - 1]} ${mes.ano}`,
              subtitulo: dia.letraDia ? `${dia.letraDia}` : '',
              trecho: trechoAoRedor(texto, q),
              editadaEm: 0,
              dados: { mes, dia },
            })
          }
        }
      }
    }

    // ── Metas ──
    if (tipo === 'tudo' || tipo === 'meta') {
      const meses = await db.meses.toArray()
      for (const mes of meses) {
        for (const cat of mes.metas || []) {
          for (const item of cat.itens || []) {
            if (item.texto?.toLowerCase().includes(lower)) {
              encontrados.push({
                id: `meta-${mes.id}-${cat.id}-${item.texto}`,
                tipo: 'meta',
                titulo: item.texto,
                subtitulo: `${cat.categoria} · ${NOMES_MES[mes.mes - 1]} ${mes.ano}`,
                trecho: item.texto,
                editadaEm: 0,
                dados: { mes, cat, item },
                feito: item.feito,
              })
            }
          }
        }
      }
    }

    // ordena: notas por data de edição (mais recente primeiro), resto ao final
    encontrados.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
    setResultados(encontrados)
    setBuscando(false)
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
            placeholder="Buscar notas, dias, metas…"
            className="w-full bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg pl-8 pr-4 py-2.5 text-sm text-ink dark:text-ink-dark placeholder-ink-3/60 dark:placeholder-ink-dark3/60 focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
          />
          {termo && (
            <button
              onClick={() => { setTermo(''); setResultados([]) }}
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
            { id: 'dia', label: 'Dias' },
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
            </div>
          )}

          {/* buscando */}
          {termo && buscando && (
            <p className="text-xs text-ink-3 dark:text-ink-dark3 py-8 text-center">Buscando…</p>
          )}

          {/* sem resultados */}
          {termo && !buscando && resultados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-sm text-ink-3 dark:text-ink-dark3">
                Nenhum resultado para <span className="text-ink dark:text-ink-dark font-medium">"{termo}"</span>
              </p>
            </div>
          )}

          {/* contagem */}
          {resultados.length > 0 && (
            <p className="text-xs text-ink-3/60 dark:text-ink-dark3/60 pb-1">
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </p>
          )}

          {/* lista de resultados */}
          {resultados.map(r => (
            <div
              key={r.id}
              className="group bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-lg px-4 py-3 hover:border-accent/40 dark:hover:border-accent-dark/40 transition-colors cursor-default"
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
