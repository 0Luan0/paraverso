import { useState, useEffect, useCallback } from 'react'
import { getMes, salvarMes } from '../../db/index'
import { RegistroDiario } from './RegistroDiario'
import { MetasMes } from './MetasMes'
import { ResumoMes } from './ResumoMes'
import { StatBar } from './StatBar'
import { HabitoSetupModal } from './HabitoSetupModal'

const NOMES_MES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

export function MesTab() {
  const hoje = new Date()
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear())
  const [mesAtual, setMesAtual] = useState(hoje.getMonth() + 1)
  const [mesObj, setMesObj] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showHabitoSetup, setShowHabitoSetup] = useState(false)
  const [saveTimer, setSaveTimer] = useState(null)

  // carregar mês do DB
  useEffect(() => {
    setLoading(true)
    getMes(anoAtual, mesAtual).then(m => {
      setMesObj(m)
      setLoading(false)
    })
  }, [anoAtual, mesAtual])

  // auto-save com debounce
  const salvarComDebounce = useCallback((novo) => {
    setMesObj(novo)
    if (saveTimer) clearTimeout(saveTimer)
    const timer = setTimeout(() => {
      salvarMes(novo)
    }, 600)
    setSaveTimer(timer)
  }, [saveTimer])

  function navMes(delta) {
    let m = mesAtual + delta
    let a = anoAtual
    if (m > 12) { m = 1; a++ }
    if (m < 1) { m = 12; a-- }
    setMesAtual(m)
    setAnoAtual(a)
  }

  function salvarHabitos(habitos) {
    // ao mudar hábitos, resetar os valores dos hábitos dos dias
    const dias = mesObj.dias.map(d => ({
      ...d,
      habitos: habitos.map((_, i) => d.habitos[i] ?? 0)
    }))
    salvarComDebounce({ ...mesObj, habitos, dias })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-ink-3 dark:text-ink-dark3">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-bg dark:bg-bg-dark">
      {/* coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* header do mês */}
        <div className="flex items-baseline justify-between px-6 py-4 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0">
          <div className="flex items-baseline gap-3">
            <h2 className="font-serif text-2xl font-medium text-ink dark:text-ink-dark">
              {NOMES_MES[mesAtual - 1]}
            </h2>
            <span className="text-sm text-ink-3 dark:text-ink-dark3">{anoAtual}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHabitoSetup(true)}
              className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-colors border border-bdr dark:border-bdr-dark rounded px-2 py-1"
            >
              ⊞ Hábitos
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navMes(-1)}
                className="text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors p-1"
              >
                ‹
              </button>
              <button
                onClick={() => { setAnoAtual(hoje.getFullYear()); setMesAtual(hoje.getMonth() + 1) }}
                className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark px-1 transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={() => navMes(1)}
                className="text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors p-1"
              >
                ›
              </button>
            </div>
          </div>
        </div>

        {/* barra de stats */}
        <StatBar mesObj={mesObj} hoje={hoje} />

        {/* registro diário */}
        <RegistroDiario
          mesObj={mesObj}
          hoje={hoje}
          onUpdate={salvarComDebounce}
        />
      </div>

      {/* painel direito */}
      <div className="w-64 flex-shrink-0 border-l border-bdr dark:border-bdr-dark bg-surface dark:bg-surface-dark flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
          <MetasMes mesObj={mesObj} onUpdate={salvarComDebounce} />
          <div className="border-t border-bdr-2 dark:border-bdr-dark2 pt-4">
            <ResumoMes mesObj={mesObj} onUpdate={salvarComDebounce} />
          </div>
        </div>
      </div>

      {showHabitoSetup && (
        <HabitoSetupModal
          habitosAtuais={mesObj.habitos}
          onSave={salvarHabitos}
          onClose={() => setShowHabitoSetup(false)}
        />
      )}
    </div>
  )
}
