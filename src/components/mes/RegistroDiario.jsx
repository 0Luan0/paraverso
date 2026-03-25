import { useState } from 'react'
import { DiaModal } from './DiaModal'

// 0=não feito (cinza), 1=feito (verde), 2=não foi possível (escuro)
const HABITO_ESTADOS = {
  0: { label: '·', bg: 'bg-bg-3 dark:bg-bg-dark3', text: 'text-ink-3 dark:text-ink-dark3' },
  1: { label: '✓', bg: 'bg-green-800/80 dark:bg-green-900', text: 'text-green-300' },
  2: { label: '–', bg: 'bg-ink-2/30 dark:bg-ink-dark3/30', text: 'text-ink-3 dark:text-ink-dark3' },
}

export function RegistroDiario({ mesObj, hoje, onUpdate }) {
  const [modalDia, setModalDia] = useState(null)

  const diasHoje = hoje.getFullYear() === mesObj.ano && hoje.getMonth() + 1 === mesObj.mes
    ? hoje.getDate()
    : null

  function ciclarHabito(diaIdx, habitoIdx) {
    const dias = [...mesObj.dias]
    const dia = { ...dias[diaIdx] }
    const atual = (dia.habitos[habitoIdx] ?? 0)
    dia.habitos = [...(dia.habitos || [])]
    dia.habitos[habitoIdx] = (atual + 1) % 3
    dias[diaIdx] = dia
    onUpdate({ ...mesObj, dias })
  }

  function salvarMemo(diaIdx, valor) {
    const dias = [...mesObj.dias]
    dias[diaIdx] = { ...dias[diaIdx], memo: valor }
    onUpdate({ ...mesObj, dias })
  }

  function salvarNotaDia(n, campos) {
    const diaIdx = n - 1
    const dias = [...mesObj.dias]
    dias[diaIdx] = { ...dias[diaIdx], ...campos }
    onUpdate({ ...mesObj, dias })
  }

  // Score do dia
  function scoreDia(dia) {
    const feitos = (dia.habitos || []).filter(h => h === 1).length
    const possiveis = (dia.habitos || []).filter(h => h !== 2).length
    if (possiveis === 0) return null
    return Math.round((feitos / possiveis) * 100)
  }

  return (
    <>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-bdr-2 dark:border-bdr-dark2">
              <th className="text-left text-xs text-ink-3 dark:text-ink-dark3 font-normal px-4 py-2 w-12">Dia</th>
              <th className="text-left text-xs text-ink-3 dark:text-ink-dark3 font-normal px-2 py-2">Memorável</th>
              {mesObj.habitos.map((h, i) => (
                <th key={i} className="text-xs text-ink-3 dark:text-ink-dark3 font-normal px-1 py-2 w-8 text-center" title={h}>
                  <span className="inline-block max-w-[28px] truncate text-center">{h[0]}</span>
                </th>
              ))}
              <th className="text-xs text-ink-3 dark:text-ink-dark3 font-normal px-2 py-2 w-10 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {mesObj.dias.map((dia, diaIdx) => {
              const ehHoje = diasHoje === dia.n
              const futuro = diasHoje !== null && dia.n > diasHoje
              const score = scoreDia(dia)
              return (
                <tr
                  key={dia.n}
                  className={`border-b border-bdr-2 dark:border-bdr-dark2 group transition-colors ${
                    ehHoje ? 'bg-accent/5 dark:bg-accent-dark/5' : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
                  } ${futuro ? 'opacity-50' : ''}`}
                >
                  {/* número + letra */}
                  <td className="px-4 py-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-sm font-medium ${ehHoje ? 'text-accent dark:text-accent-dark' : 'text-ink dark:text-ink-dark'}`}>
                        {dia.n}
                      </span>
                      <span className="text-xs text-ink-3 dark:text-ink-dark3">{dia.letraDia}</span>
                    </div>
                  </td>

                  {/* memo — campo inline */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={dia.memo}
                        onChange={e => salvarMemo(diaIdx, e.target.value)}
                        placeholder={ehHoje ? 'O que ficou hoje?' : ''}
                        className="w-full bg-transparent text-sm text-ink dark:text-ink-dark placeholder-ink-3/50 dark:placeholder-ink-dark3/50 focus:outline-none border-b border-transparent focus:border-bdr dark:focus:border-bdr-dark transition-colors"
                      />
                      {/* botão para abrir modal */}
                      <button
                        onClick={() => setModalDia(dia)}
                        className="opacity-0 group-hover:opacity-100 text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark transition-all text-xs ml-1 flex-shrink-0"
                        title="Expandir nota do dia"
                      >
                        ↗
                      </button>
                    </div>
                  </td>

                  {/* hábitos */}
                  {mesObj.habitos.map((_, hIdx) => {
                    const estado = dia.habitos[hIdx] ?? 0
                    const e = HABITO_ESTADOS[estado]
                    return (
                      <td key={hIdx} className="px-1 py-1.5 text-center">
                        <button
                          onClick={() => ciclarHabito(diaIdx, hIdx)}
                          className={`w-6 h-6 rounded text-xs font-medium transition-colors ${e.bg} ${e.text} hover:opacity-80`}
                          title={mesObj.habitos[hIdx]}
                        >
                          {e.label}
                        </button>
                      </td>
                    )
                  })}

                  {/* score % */}
                  <td className="px-2 py-1.5 text-right">
                    {score !== null ? (
                      <span className={`text-xs ${score >= 75 ? 'text-green-600 dark:text-green-400' : score >= 50 ? 'text-accent dark:text-accent-dark' : 'text-ink-3 dark:text-ink-dark3'}`}>
                        {score}%
                      </span>
                    ) : (
                      <span className="text-xs text-ink-3/30 dark:text-ink-dark3/30">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalDia && (
        <DiaModal
          dia={modalDia}
          mesObj={mesObj}
          onClose={() => setModalDia(null)}
          onSave={salvarNotaDia}
        />
      )}
    </>
  )
}
