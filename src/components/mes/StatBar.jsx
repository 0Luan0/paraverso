export function StatBar({ mesObj, hoje }) {
  const diasDoMes = mesObj.dias.length
  const diasPassados = mesObj.dias.filter(d => {
    const data = new Date(mesObj.ano, mesObj.mes - 1, d.n)
    return data <= hoje
  }).length

  const diasComMemo = mesObj.dias.filter(d => d.memo && d.memo.trim()).length

  // calcular % geral de hábitos
  let totalPossiveis = 0
  let totalFeitos = 0
  mesObj.dias.forEach(dia => {
    (dia.habitos || []).forEach(h => {
      if (h !== 2) totalPossiveis++
      if (h === 1) totalFeitos++
    })
  })
  const pctHabitos = totalPossiveis > 0 ? Math.round((totalFeitos / totalPossiveis) * 100) : 0

  // streak atual
  let streak = 0
  const diasOrdenados = [...mesObj.dias].reverse()
  for (const dia of diasOrdenados) {
    const data = new Date(mesObj.ano, mesObj.mes - 1, dia.n)
    if (data > hoje) continue
    const feitos = (dia.habitos || []).filter(h => h === 1).length
    const total = (dia.habitos || []).filter(h => h !== 2).length
    if (total > 0 && feitos / total >= 0.5) streak++
    else break
  }

  // metas
  const totalMetas = mesObj.metas.reduce((acc, c) => acc + c.itens.length, 0)
  const metasFeitas = mesObj.metas.reduce((acc, c) => acc + c.itens.filter(i => i.feito).length, 0)

  const stats = [
    { label: 'Dias registrados', valor: `${diasComMemo}/${diasPassados}` },
    { label: 'Hábitos', valor: `${pctHabitos}%` },
    { label: 'Streak', valor: `${streak}d` },
    { label: 'Metas', valor: `${metasFeitas}/${totalMetas}` },
  ]

  return (
    <div className="flex gap-4 px-6 py-2.5 border-b border-bdr-2 dark:border-bdr-dark2 bg-surface dark:bg-surface-dark flex-shrink-0">
      {stats.map(s => (
        <div key={s.label} className="flex flex-col">
          <span className="text-xs text-ink-3 dark:text-ink-dark3">{s.label}</span>
          <span className="text-sm font-medium text-ink dark:text-ink-dark">{s.valor}</span>
        </div>
      ))}
    </div>
  )
}
