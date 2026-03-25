export function ResumoMes({ mesObj, onUpdate }) {
  function salvarResumo(texto) {
    onUpdate({ ...mesObj, resumo: texto })
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-ink-3 dark:text-ink-dark3 uppercase tracking-wider">
        Resumo do mês
      </p>
      <textarea
        value={mesObj.resumo || ''}
        onChange={e => salvarResumo(e.target.value)}
        placeholder="O que aconteceu? O que quer guardar deste mês?"
        rows={5}
        className="resize-none text-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr-2 dark:border-bdr-dark2 rounded-lg p-3 text-ink dark:text-ink-dark placeholder-ink-3/60 dark:placeholder-ink-dark3/60 focus:outline-none focus:border-bdr dark:focus:border-bdr-dark transition-colors leading-relaxed"
      />
    </div>
  )
}
