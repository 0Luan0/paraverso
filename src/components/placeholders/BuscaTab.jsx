export function BuscaTab() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-bg dark:bg-bg-dark">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        <div className="opacity-30 text-4xl text-ink-3 dark:text-ink-dark3">
          ⌕
        </div>

        <div>
          <p className="font-serif text-lg text-ink dark:text-ink-dark font-medium">Busca</p>
          <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-1 leading-relaxed">
            Busca full-text em tempo real por notas, dias do mês e metas simultaneamente.
            Disponível em breve.
          </p>
        </div>

        <div className="text-xs text-ink-3/50 dark:text-ink-dark3/50 border border-bdr-2 dark:border-bdr-dark2 rounded-lg px-4 py-2">
          Fase 2 do roadmap
        </div>
      </div>
    </div>
  )
}
