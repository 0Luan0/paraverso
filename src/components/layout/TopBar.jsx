const TEXTURA_LABELS = {
  none:  { icon: '—', label: 'Textura' },
  dots:  { icon: '⠿', label: 'Pontilhado' },
  grid:  { icon: '⊞', label: 'Quadriculado' },
}

// detecta se está rodando dentro do Electron
const isElectron = typeof window !== 'undefined' &&
  window.navigator.userAgent.toLowerCase().includes('electron')

export function TopBar({ dark, toggleTheme, textura = 'none', cycleTextura }) {
  const tx = TEXTURA_LABELS[textura] || TEXTURA_LABELS.none

  return (
    <div
      className="flex items-center justify-between h-11 bg-bg-2 dark:bg-bg-dark2 border-b border-bdr dark:border-bdr-dark flex-shrink-0"
      style={{
        paddingLeft: isElectron ? '80px' : '20px',
        paddingRight: '20px',
        WebkitAppRegion: isElectron ? 'drag' : 'auto',
      }}
    >
      <span className="text-sm font-medium tracking-wide text-ink dark:text-ink-dark select-none">
        Para<span className="text-accent dark:text-accent-dark">verso</span>
      </span>

      {/* no-drag nos botões para que cliques funcionem normalmente */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* botão de textura */}
        <button
          onClick={cycleTextura}
          className="flex items-center gap-1.5 text-xs text-ink-2 dark:text-ink-dark2 border border-bdr dark:border-bdr-dark rounded-full px-3 py-1 hover:bg-bg-3 dark:hover:bg-bg-dark3 transition-colors"
          title="Alternar textura de fundo"
        >
          <span className="text-sm leading-none">{tx.icon}</span>
          {tx.label}
        </button>

        {/* botão de tema */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 text-xs text-ink-2 dark:text-ink-dark2 border border-bdr dark:border-bdr-dark rounded-full px-3 py-1 hover:bg-bg-3 dark:hover:bg-bg-dark3 transition-colors"
          title={dark ? 'Modo claro' : 'Modo escuro'}
        >
          {dark ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              Claro
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              Escuro
            </>
          )}
        </button>
      </div>
    </div>
  )
}
