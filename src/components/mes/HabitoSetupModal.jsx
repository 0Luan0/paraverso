import { useState } from 'react'

export function HabitoSetupModal({ habitosAtuais, onSave, onClose }) {
  const [habitos, setHabitos] = useState([...habitosAtuais])
  const [novoHabito, setNovoHabito] = useState('')

  function adicionar() {
    const nome = novoHabito.trim()
    if (!nome || habitos.length >= 7) return
    setHabitos(h => [...h, nome])
    setNovoHabito('')
  }

  function remover(idx) {
    setHabitos(h => h.filter((_, i) => i !== idx))
  }

  function salvar() {
    onSave(habitos)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-bdr dark:border-bdr-dark w-full max-w-sm mx-4 shadow-xl">
        <div className="px-5 py-3 border-b border-bdr dark:border-bdr-dark">
          <p className="font-serif text-base font-medium text-ink dark:text-ink-dark">Hábitos do mês</p>
          <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">Máximo 7 hábitos</p>
        </div>

        <div className="px-5 py-4 space-y-2">
          {habitos.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-bg-2 dark:bg-bg-dark2 rounded-md">
              <span className="text-sm text-ink dark:text-ink-dark">{h}</span>
              <button
                onClick={() => remover(i)}
                className="text-ink-3 dark:text-ink-dark3 hover:text-red-500 transition-colors text-xs"
              >
                ✕
              </button>
            </div>
          ))}

          {habitos.length < 7 && (
            <div className="flex gap-2 mt-3">
              <input
                value={novoHabito}
                onChange={e => setNovoHabito(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionar()}
                placeholder="Novo hábito..."
                className="flex-1 text-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-md px-3 py-1.5 text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark"
              />
              <button
                onClick={adicionar}
                className="text-xs bg-accent dark:bg-accent-dark text-white rounded-md px-3 py-1.5 hover:bg-accent-2 transition-colors"
              >
                + Add
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-bdr-2 dark:border-bdr-dark2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            className="text-xs bg-accent dark:bg-accent-dark text-white rounded px-3 py-1 hover:bg-accent-2 transition-colors"
          >
            Salvar hábitos
          </button>
        </div>
      </div>
    </div>
  )
}
