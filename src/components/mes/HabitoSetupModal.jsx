import { useState } from 'react'

const HABITOS_SUGERIDOS = [
  'Treino', 'Leitura', 'Meditação', 'Caminhada',
  'Alimentação saudável', 'Dormir cedo', 'Acordar cedo',
  'Menos telas', 'Estudar', 'Escrever', 'Água (2L)',
  'Foco (deep work)', 'Sem álcool', 'Sem açúcar', 'Gratidão',
]

export function HabitoSetupModal({ habitosAtuais, onSave, onClose }) {
  const [selecionados, setSelecionados] = useState(new Set(habitosAtuais))
  const [customHabito, setCustomHabito] = useState('')

  const totalSelecionados = selecionados.size

  function toggleHabito(nome) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(nome)) {
        novo.delete(nome)
      } else {
        if (novo.size >= 7) return prev
        novo.add(nome)
      }
      return novo
    })
  }

  function adicionarCustom() {
    const nome = customHabito.trim()
    if (!nome || selecionados.size >= 7) return
    setSelecionados(prev => new Set([...prev, nome]))
    setCustomHabito('')
  }

  function salvar() {
    // manter a ordem original dos já existentes, adicionar novos no final
    const anteriores = habitosAtuais.filter(h => selecionados.has(h))
    const novos = [...selecionados].filter(h => !habitosAtuais.includes(h))
    onSave([...anteriores, ...novos])
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-lg border border-bdr dark:border-bdr-dark w-full max-w-sm mx-4 shadow-xl">

        {/* header */}
        <div className="px-5 py-3 border-b border-bdr dark:border-bdr-dark flex items-center justify-between">
          <div>
            <p className="font-serif text-base font-medium text-ink dark:text-ink-dark">Hábitos do mês</p>
            <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">
              Escolha até 7 · <span className={totalSelecionados >= 7 ? 'text-accent dark:text-accent-dark font-medium' : ''}>{totalSelecionados}/7 selecionados</span>
            </p>
          </div>
        </div>

        {/* lista de checkboxes */}
        <div className="px-5 py-4 max-h-72 overflow-auto">
          <div className="grid grid-cols-2 gap-1.5">
            {HABITOS_SUGERIDOS.map(h => {
              const ativo = selecionados.has(h)
              const desabilitado = !ativo && totalSelecionados >= 7
              return (
                <button
                  key={h}
                  onClick={() => toggleHabito(h)}
                  disabled={desabilitado}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left transition-all text-sm ${
                    ativo
                      ? 'border-accent dark:border-accent-dark bg-accent/10 dark:bg-accent-dark/10 text-ink dark:text-ink-dark'
                      : desabilitado
                        ? 'border-bdr-2 dark:border-bdr-dark2 text-ink-3 dark:text-ink-dark3 opacity-40 cursor-not-allowed'
                        : 'border-bdr-2 dark:border-bdr-dark2 text-ink-2 dark:text-ink-dark2 hover:border-bdr dark:hover:border-bdr-dark hover:bg-bg-2 dark:hover:bg-bg-dark2'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center transition-colors ${
                    ativo
                      ? 'bg-accent dark:bg-accent-dark border-accent dark:border-accent-dark'
                      : 'border-bdr dark:border-bdr-dark'
                  }`}>
                    {ativo && (
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{h}</span>
                </button>
              )
            })}
          </div>

          {/* hábitos personalizados já adicionados (que não estão na lista padrão) */}
          {[...selecionados].filter(h => !HABITOS_SUGERIDOS.includes(h)).map(h => (
            <button
              key={h}
              onClick={() => toggleHabito(h)}
              className="mt-1.5 w-full flex items-center gap-2 px-3 py-2 rounded-md border border-accent dark:border-accent-dark bg-accent/10 dark:bg-accent-dark/10 text-left text-sm text-ink dark:text-ink-dark transition-all"
            >
              <span className="w-3.5 h-3.5 rounded-sm border flex-shrink-0 flex items-center justify-center bg-accent dark:bg-accent-dark border-accent dark:border-accent-dark">
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <span className="truncate flex-1">{h}</span>
              <span className="text-xs text-ink-3 dark:text-ink-dark3">personalizado</span>
            </button>
          ))}
        </div>

        {/* adicionar personalizado */}
        {totalSelecionados < 7 && (
          <div className="px-5 pb-3 flex gap-2">
            <input
              value={customHabito}
              onChange={e => setCustomHabito(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarCustom()}
              placeholder="Outro hábito..."
              className="flex-1 text-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-md px-3 py-1.5 text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark"
            />
            <button
              onClick={adicionarCustom}
              className="text-xs bg-accent dark:bg-accent-dark text-white rounded-md px-3 py-1.5 hover:bg-accent-2 transition-colors"
            >
              + Add
            </button>
          </div>
        )}

        {/* footer */}
        <div className="px-5 py-3 border-t border-bdr-2 dark:border-bdr-dark2 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={totalSelecionados === 0}
            className="text-xs bg-accent dark:bg-accent-dark text-white rounded px-3 py-1 hover:bg-accent-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Salvar hábitos
          </button>
        </div>
      </div>
    </div>
  )
}
