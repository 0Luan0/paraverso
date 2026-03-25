import { useState } from 'react'

export function NotesSidebar({
  cadernos,
  notas,
  caderno,
  setCaderno,
  notaSelecionada,
  setNotaSelecionada,
  onNovaNota,
  onNovoCaderno,
  onDeletarNota,
}) {
  const [novoCadernoMode, setNovoCadernoMode] = useState(false)
  const [nomeNovoCaderno, setNomeNovoCaderno] = useState('')

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
      {/* cadernos */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-ink-3 dark:text-ink-dark3 uppercase tracking-wider font-medium">Cadernos</span>
          <button
            onClick={() => setNovoCadernoMode(true)}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors"
            title="Novo caderno"
          >
            +
          </button>
        </div>

        <div className="space-y-0.5">
          {cadernos.map(c => (
            <button
              key={c.id}
              onClick={() => { setCaderno(c.nome); setNotaSelecionada(null) }}
              className={`w-full text-left text-sm px-2 py-1 rounded-md transition-colors ${
                caderno === c.nome
                  ? 'bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark'
                  : 'text-ink-2 dark:text-ink-dark2 hover:bg-bg-2 dark:hover:bg-bg-dark2'
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>

        {novoCadernoMode && (
          <div className="flex gap-1 mt-2">
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

      {/* divisor */}
      <div className="border-t border-bdr-2 dark:border-bdr-dark2 mx-3 my-2" />

      {/* lista de notas */}
      <div className="flex items-center justify-between px-3 mb-1">
        <span className="text-xs text-ink-3 dark:text-ink-dark3 uppercase tracking-wider font-medium">
          {caderno}
        </span>
        <button
          onClick={onNovaNota}
          className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors"
          title="Nova nota"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-auto px-2 pb-2 space-y-0.5">
        {notas.length === 0 && (
          <p className="text-xs text-ink-3 dark:text-ink-dark3 px-2 py-3 text-center">
            Nenhuma nota ainda.<br/>Clique em + para criar.
          </p>
        )}
        {notas.map(n => (
          <div
            key={n.id}
            className={`group relative flex flex-col gap-0.5 px-2 py-2 rounded-md cursor-pointer transition-colors ${
              notaSelecionada?.id === n.id
                ? 'bg-accent/10 dark:bg-accent-dark/10'
                : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
            }`}
            onClick={() => setNotaSelecionada(n)}
          >
            <span className="text-sm text-ink dark:text-ink-dark truncate">{n.titulo || 'Sem título'}</span>
            <span className="text-xs text-ink-3 dark:text-ink-dark3">{formatarData(n.editadaEm)}</span>
            {/* delete hover */}
            <button
              onClick={e => { e.stopPropagation(); onDeletarNota(n.id) }}
              className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-all text-xs"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
