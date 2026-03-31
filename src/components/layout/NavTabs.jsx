const TABS = [
  { id: 'mes',    label: 'Mês'           },
  { id: 'notas',  label: 'Notas'         },
  { id: 'busca',  label: 'Busca'         },
  { id: 'grafo',  label: 'Grafo'         },
  { id: 'config', label: 'Configurações' },
]

export function NavTabs({ aba, setAba }) {
  return (
    <div className="flex border-b border-bdr dark:border-bdr-dark bg-bg-2 dark:bg-bg-dark2 flex-shrink-0">
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => setAba(t.id)}
          className={`text-xs px-5 py-2 border-b-2 transition-all ${
            aba === t.id
              ? 'text-ink dark:text-ink-dark border-accent dark:border-accent-dark'
              : 'text-ink-3 dark:text-ink-dark3 border-transparent hover:text-ink-2 dark:hover:text-ink-dark2'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
