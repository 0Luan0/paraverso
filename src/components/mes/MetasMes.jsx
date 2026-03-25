import { useState } from 'react'

export function MetasMes({ mesObj, onUpdate }) {
  const [novaCategoria, setNovaCategoria] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [novoItem, setNovoItem] = useState({}) // catId -> texto

  function toggleItem(catId, itemIdx) {
    const metas = mesObj.metas.map(cat => {
      if (cat.id !== catId) return cat
      const itens = cat.itens.map((item, i) =>
        i === itemIdx ? { ...item, feito: !item.feito } : item
      )
      return { ...cat, itens }
    })
    onUpdate({ ...mesObj, metas })
  }

  function adicionarItem(catId) {
    const texto = (novoItem[catId] || '').trim()
    if (!texto) return
    const metas = mesObj.metas.map(cat => {
      if (cat.id !== catId) return cat
      return { ...cat, itens: [...cat.itens, { id: crypto.randomUUID(), texto, feito: false }] }
    })
    onUpdate({ ...mesObj, metas })
    setNovoItem(prev => ({ ...prev, [catId]: '' }))
  }

  function deletarItem(catId, itemIdx) {
    const metas = mesObj.metas.map(cat => {
      if (cat.id !== catId) return cat
      return { ...cat, itens: cat.itens.filter((_, i) => i !== itemIdx) }
    })
    onUpdate({ ...mesObj, metas })
  }

  function adicionarCategoria() {
    const nome = novaCategoria.trim()
    if (!nome) return
    const nova = { id: crypto.randomUUID(), categoria: nome, itens: [] }
    onUpdate({ ...mesObj, metas: [...mesObj.metas, nova] })
    setNovaCategoria('')
    setAddingCat(false)
  }

  function deletarCategoria(catId) {
    onUpdate({ ...mesObj, metas: mesObj.metas.filter(c => c.id !== catId) })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-3 dark:text-ink-dark3 uppercase tracking-wider">Metas</p>
        <button
          onClick={() => setAddingCat(true)}
          className="text-xs text-accent dark:text-accent-dark hover:underline"
        >
          + categoria
        </button>
      </div>

      {mesObj.metas.map(cat => {
        const feitos = cat.itens.filter(i => i.feito).length
        return (
          <div key={cat.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-2 dark:text-ink-dark2 uppercase tracking-wide">
                {cat.categoria}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-3 dark:text-ink-dark3">{feitos}/{cat.itens.length}</span>
                <button
                  onClick={() => deletarCategoria(cat.id)}
                  className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remover categoria"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {cat.itens.map((item, itemIdx) => (
                <div key={item.id} className="flex items-start gap-2 group/item">
                  <button
                    onClick={() => toggleItem(cat.id, itemIdx)}
                    className={`w-3.5 h-3.5 mt-0.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                      item.feito
                        ? 'bg-accent dark:bg-accent-dark border-accent dark:border-accent-dark'
                        : 'border-bdr dark:border-bdr-dark bg-transparent hover:border-accent dark:hover:border-accent-dark'
                    }`}
                  >
                    {item.feito && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <span className={`text-sm leading-snug flex-1 ${
                    item.feito
                      ? 'line-through text-ink-3 dark:text-ink-dark3'
                      : 'text-ink dark:text-ink-dark'
                  }`}>
                    {item.texto}
                  </span>
                  <button
                    onClick={() => deletarItem(cat.id, itemIdx)}
                    className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-all flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* add item */}
            <div className="flex gap-1 mt-1">
              <input
                value={novoItem[cat.id] || ''}
                onChange={e => setNovoItem(prev => ({ ...prev, [cat.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && adicionarItem(cat.id)}
                placeholder="+ nova meta..."
                className="flex-1 text-xs bg-transparent border-b border-bdr-2 dark:border-bdr-dark2 py-0.5 text-ink dark:text-ink-dark placeholder-ink-3/50 dark:placeholder-ink-dark3/50 focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
              />
            </div>
          </div>
        )
      })}

      {/* nova categoria */}
      {addingCat && (
        <div className="flex gap-2 pt-1">
          <input
            autoFocus
            value={novaCategoria}
            onChange={e => setNovaCategoria(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') adicionarCategoria()
              if (e.key === 'Escape') setAddingCat(false)
            }}
            placeholder="Nome da categoria..."
            className="flex-1 text-xs bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded px-2 py-1.5 text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark"
          />
          <button
            onClick={adicionarCategoria}
            className="text-xs bg-accent dark:bg-accent-dark text-white rounded px-2 py-1.5"
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
