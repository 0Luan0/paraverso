export function GraphTab() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-bg dark:bg-bg-dark">
      <div className="flex flex-col items-center gap-3 max-w-sm text-center">
        {/* ícone decorativo */}
        <div className="relative w-24 h-24 opacity-30">
          {[
            { cx: 50, cy: 20, r: 8 },
            { cx: 20, cy: 65, r: 6 },
            { cx: 80, cy: 65, r: 6 },
            { cx: 50, cy: 80, r: 5 },
          ].map((c, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${c.cx}%`,
                top: `${c.cy}%`,
                width: c.r * 2,
                height: c.r * 2,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                background: 'currentColor',
              }}
              className="text-accent dark:text-accent-dark"
            />
          ))}
          <svg className="absolute inset-0 w-full h-full text-bdr dark:text-bdr-dark" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1">
            <line x1="50" y1="20" x2="20" y2="65"/>
            <line x1="50" y1="20" x2="80" y2="65"/>
            <line x1="20" y1="65" x2="50" y2="80"/>
            <line x1="80" y1="65" x2="50" y2="80"/>
          </svg>
        </div>

        <div>
          <p className="font-serif text-lg text-ink dark:text-ink-dark font-medium">Graph View</p>
          <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-1 leading-relaxed">
            Visualização de rede das suas notas conectadas via [[links]].
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
