import { useVault } from '../contexts/VaultContext'

export function VaultSetup() {
  const { chooseVault } = useVault()

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-bg dark:bg-bg-dark px-8">
      {/* Logo */}
      <div className="mb-10 text-center select-none">
        <h1 className="text-4xl font-serif text-ink dark:text-ink-dark tracking-tight">
          Para<span className="text-accent dark:text-accent-dark">verso</span>
        </h1>
        <p className="mt-2 text-sm text-ink-2 dark:text-ink-dark2">
          seu caderno digital
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-xl p-8 shadow-sm">
        {/* Vault icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-bg-3 dark:bg-bg-dark3 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5"
              className="text-accent dark:text-accent-dark">
              <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
              <path d="M3 7l9 6 9-6"/>
            </svg>
          </div>
        </div>

        <h2 className="text-lg font-serif text-ink dark:text-ink-dark text-center mb-2">
          Escolha a pasta do vault
        </h2>

        <p className="text-sm text-ink-2 dark:text-ink-dark2 text-center leading-relaxed mb-8">
          Suas notas e registros mensais ficam salvos como arquivos&nbsp;
          <code className="text-accent dark:text-accent-dark">.md</code> numa pasta
          que você escolhe. Funciona com iCloud, Git e qualquer editor de texto.
        </p>

        <button
          onClick={chooseVault}
          className="w-full flex items-center justify-center gap-2 bg-accent dark:bg-accent-dark text-white rounded-lg px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Escolher pasta
        </button>

        {/* Info bullets */}
        <div className="mt-6 space-y-2">
          {[
            'Tudo fica no seu computador, sem servidor',
            'Faça backup com iCloud ou Google Drive',
            'Abra qualquer nota em outro app de texto',
            'Você pode trocar a pasta depois nas configurações',
          ].map(txt => (
            <div key={txt} className="flex items-start gap-2 text-xs text-ink-2 dark:text-ink-dark2">
              <span className="mt-0.5 text-accent dark:text-accent-dark flex-shrink-0">✓</span>
              <span>{txt}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
