import { useState, useRef, useEffect } from 'react'
import { useVault } from '../../contexts/VaultContext'
// changeVault é exposto pelo VaultContext
import { parseObsidianFrontmatter } from '../../lib/markdownUtils'
import { getCadernos } from '../../db/index'
import { setTemplatesDir, getTemplatesVault, lerTemplateVault } from '../../lib/vaultFs'

// ── Helpers ───────────────────────────────────────────────────────────────────

const el = () => window.electron

function sanitizeName(name) {
  return (name || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
}

// Pasta do Obsidian que devem ser ignoradas durante o scan
const SKIP_DIRS = new Set([
  '.obsidian', '.trash', '.git', '_attachments', 'attachments',
  'assets', 'resources', 'media', 'images', 'imgs',
])

/**
 * Escaneia recursivamente uma pasta do Obsidian, retornando todos os .md
 * com o caderno correspondente (nome da pasta de primeiro nível).
 * Ignora pastas ocultas e de assets.
 */
async function scanObsidianVault(folderPath, cadernoHint = null, subpastaHint = null, depth = 0) {
  const allEntries  = await el().readdir(folderPath)
  const dirEntries  = await el().readdir(folderPath, { dirsOnly: true })
  const dirSet      = new Set(dirEntries)

  const mdFiles = allEntries.filter(e => !dirSet.has(e) && e.toLowerCase().endsWith('.md'))
  const results = []

  for (const file of mdFiles) {
    const filePath = await el().joinPath(folderPath, file)
    results.push({ filePath, caderno: cadernoHint || 'Notas', subpasta: subpastaHint })
  }

  // Recursão em subpastas (máximo 3 níveis)
  if (depth < 3) {
    for (const dir of dirEntries) {
      if (dir.startsWith('.') || SKIP_DIRS.has(dir) || SKIP_DIRS.has(dir.toLowerCase())) continue
      const subPath = await el().joinPath(folderPath, dir)
      const caderno = depth === 0 ? dir : cadernoHint
      // Subpasta: a partir do depth 1, acumula o caminho relativo
      const subpasta = depth === 0 ? null : (subpastaHint ? subpastaHint + '/' + dir : dir)
      const sub = await scanObsidianVault(subPath, caderno, depth >= 1 ? (subpasta ?? dir) : null, depth + 1)
      results.push(...sub)
    }
  }

  return results
}

function yamlStr(s) {
  const str = String(s || '')
  if (!str) return '""'
  if (/[:#{}\[\],&*?|<>=!%@`\\"]/.test(str) || str.startsWith(' ') || str.endsWith(' ') || str.includes('\n')) {
    return JSON.stringify(str)
  }
  return str
}

/**
 * Importa um único arquivo Obsidian para o vault Paraverso.
 * - Preserva o `id:` se o arquivo já for Paraverso nativo (evita ID duplo)
 * - Preserva `criadaEm` original ao sobrescrever
 * Retorna: { status: 'imported' | 'skipped' | 'error', titulo }
 */
async function importarArquivo(filePath, caderno, vaultPath, { sobrescrever = false, subpasta = null } = {}) {
  try {
    const raw = await el().readFile(filePath)

    // ── Detecta se já é Paraverso nativo (tem id: no frontmatter YAML) ────
    // Preserva o ID original para evitar conflitos ao re-importar
    let existingId = null
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const idLine = fmMatch[1].match(/^id:\s*(.+)$/m)
      if (idLine) existingId = idLine[1].trim()
    }

    // ── Parse frontmatter e corpo ──────────────────────────────────────────
    let titulo, tags, markdownBody

    const hasFrontmatter = /^---\r?\n/.test(raw)
    if (hasFrontmatter) {
      const { meta, body } = parseObsidianFrontmatter(raw)
      titulo       = meta.title || meta.titulo || ''
      tags         = Array.isArray(meta.tags) ? meta.tags
                   : meta.tags ? String(meta.tags).split(',').map(t => t.trim()).filter(Boolean)
                   : []
      markdownBody = body
    } else {
      titulo       = ''
      tags         = []
      markdownBody = raw
    }

    // Fallback: usa o nome do arquivo
    const nomeArquivo = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '')
    if (!titulo) titulo = nomeArquivo

    // Extrai título do H1 se o título ainda for o nome do arquivo
    const h1 = markdownBody.match(/^#\s+(.+)/m)
    if (h1 && titulo === nomeArquivo) titulo = h1[1].trim()

    // ── Verifica se já existe (por path) ───────────────────────────────────
    const cadernoDir = sanitizeName(caderno)
    const filename   = sanitizeName(titulo)
    // Preserva subpasta se existir (ex: "TikTok" dentro de "04 - Projetos")
    const destDir    = subpasta
      ? await el().joinPath(vaultPath, cadernoDir, subpasta)
      : await el().joinPath(vaultPath, cadernoDir)
    const newPath    = await el().joinPath(destDir, filename + '.md')
    const jaExiste   = await el().exists(newPath)

    if (jaExiste && !sobrescrever) return { status: 'skipped', titulo }

    // ── Preserva criadaEm do arquivo existente ao sobrescrever ────────────
    let criadaEm = Date.now()
    if (jaExiste && sobrescrever) {
      try {
        const existingRaw = await el().readFile(newPath)
        const criadaEmMatch = existingRaw.match(/^criadaEm:\s*(\d+)$/m)
        if (criadaEmMatch) criadaEm = parseInt(criadaEmMatch[1], 10)
        // Preserva ID original do arquivo existente também
        if (!existingId) {
          const existIdMatch = existingRaw.match(/^id:\s*(.+)$/m)
          if (existIdMatch) existingId = existIdMatch[1].trim()
        }
      } catch {}
    }

    // ── Monta frontmatter YAML Paraverso ───────────────────────────────────
    const id = existingId || crypto.randomUUID()
    const now = Date.now()

    const tagsYaml = tags.length > 0
      ? '[' + tags.map(t => JSON.stringify(t)).join(', ') + ']'
      : '[]'

    const yaml = [
      '---',
      `id: ${id}`,
      `titulo: ${yamlStr(titulo)}`,
      `caderno: ${yamlStr(caderno)}`,
      `tags: ${tagsYaml}`,
      `criadaEm: ${criadaEm}`,
      `editadaEm: ${now}`,
      '---',
      '',
    ].join('\n')

    await el().writeFile(newPath, yaml + markdownBody)
    return { status: 'imported', titulo }
  } catch (err) {
    const filename = filePath.split(/[/\\]/).pop()
    return { status: 'error', titulo: filename, error: err.message }
  }
}

// ── Atalhos documentados ───────────────────────────────────────────────────────

const ATALHOS = [
  { teclas: ['⌘', 'O'],     desc: 'Abrir nota rapidamente (Quick Switcher)' },
  { teclas: ['⌘', 'N'],     desc: 'Criar nova nota no caderno padrão'        },
  { teclas: ['⌘', 'F'],     desc: 'Buscar dentro da nota atual'              },
  { teclas: ['⌘', 'T'],     desc: 'Inserir template na nota atual'           },
  { teclas: ['⌘', 'Z'],     desc: 'Desfazer'                                 },
  { teclas: ['⌘', '⇧', 'Z'], desc: 'Refazer'                                },
  { teclas: ['⌘', 'B'],     desc: 'Negrito'                                  },
  { teclas: ['⌘', 'I'],     desc: 'Itálico'                                  },
  { teclas: ['Tab'],        desc: 'Indentar item de lista'                   },
  { teclas: ['⇧', 'Tab'],   desc: 'Remover indentação de lista'              },
]

// ── Componente principal ───────────────────────────────────────────────────────

export function ConfigTab({ dark, toggleTheme, textura, setTexturaTo }) {
  const { vaultPath, changeVault } = useVault()

  // Obsidian import states
  const [obsidianPath, setObsidianPath]   = useState(null)
  const [arquivos, setArquivos]           = useState([])   // { filePath, caderno }[]
  const [escaneando, setEscaneando]       = useState(false)
  const [importando, setImportando]       = useState(false)
  const [progresso, setProgresso]         = useState(0)
  const [arquivoAtual, setArquivoAtual]   = useState('')
  const [resultados, setResultados]       = useState(null) // { importados, ignorados, erros }
  const [sobrescrever, setSobrescrever]   = useState(false)
  const abortRef = useRef(false)

  // Clear data states
  const [limpandoDados, setLimpandoDados]     = useState(false)
  const [confirmLimpar, setConfirmLimpar]     = useState(false)
  const [dadosLimpos, setDadosLimpos]         = useState(false)

  // Default caderno
  const [cadernos, setCadernos]               = useState([])
  const [defaultCaderno, setDefaultCaderno]   = useState('')
  const [savedCaderno, setSavedCaderno]       = useState(false)

  // Daily journal folder
  const [journalCaderno, setJournalCaderno]   = useState('')
  const [savedJournal, setSavedJournal]       = useState(false)

  // Templates folder
  const [topDirs, setTopDirs]                 = useState([])
  const [templatesDir, setTemplatesDirState]  = useState('templates')
  const [savedTemplates, setSavedTemplates]   = useState(false)
  // Gerenciador de templates
  const [templatesList, setTemplatesList]     = useState([])
  const [templateEditando, setTemplateEditando] = useState(null)

  // Timer refs para cleanup de "saved" feedback
  const feedbackTimers = useRef([])
  useEffect(() => {
    return () => feedbackTimers.current.forEach(t => clearTimeout(t))
  }, [])
  const [templateNovo, setTemplateNovo]       = useState(false)
  const [templateNome, setTemplateNome]       = useState('')
  const [templateConteudo, setTemplateConteudo] = useState('')
  const [templateSaving, setTemplateSaving]   = useState(false)



  useEffect(() => {
    getCadernos().then(lista => setCadernos(lista)).catch(() => {})
    window.electron?.getConfig('defaultCaderno').then(v => {
      if (v) setDefaultCaderno(v)
    }).catch(() => {})
    window.electron?.getConfig('templatesDir').then(v => {
      const dir = v || 'templates'
      setTemplatesDirState(dir)
      setTemplatesDir(dir)
    }).catch(() => {})
    window.electron?.getConfig('journalCaderno').then(v => {
      if (v) setJournalCaderno(v)
    }).catch(() => {})
    carregarTemplates()
  }, [])

  // Carrega top-level dirs do vault para o seletor de pasta de templates
  useEffect(() => {
    if (!vaultPath) return
    window.electron?.readdir(vaultPath, { dirsOnly: true })
      .then(dirs => setTopDirs((dirs || []).filter(d => !d.startsWith('.'))))
      .catch(() => {})
  }, [vaultPath])

  async function salvarDefaultCaderno(nome) {
    setDefaultCaderno(nome)
    await window.electron?.setConfig('defaultCaderno', nome)
    setSavedCaderno(true)
    feedbackTimers.current.push(setTimeout(() => setSavedCaderno(false), 1500))
  }

  async function salvarJournalCaderno(nome) {
    setJournalCaderno(nome)
    await window.electron?.setConfig('journalCaderno', nome)
    setSavedJournal(true)
    feedbackTimers.current.push(setTimeout(() => setSavedJournal(false), 1500))
  }

  async function salvarTemplatesDir(nome) {
    setTemplatesDirState(nome)
    setTemplatesDir(nome)
    await window.electron?.setConfig('templatesDir', nome)
    setSavedTemplates(true)
    feedbackTimers.current.push(setTimeout(() => setSavedTemplates(false), 1500))
  }

  // ── Gerenciador de templates ──────────────────────────────────────────────

  async function carregarTemplates() {
    if (!vaultPath) return
    try { setTemplatesList(await getTemplatesVault(vaultPath)) } catch {}
  }

  async function editarTemplate(filename) {
    try {
      const conteudo = await lerTemplateVault(vaultPath, filename)
      setTemplateNome(filename.replace(/\.md$/, ''))
      setTemplateConteudo(conteudo)
      setTemplateEditando(filename)
      setTemplateNovo(false)
    } catch (e) { console.error('Erro ao ler template:', e) }
  }

  async function salvarTemplate() {
    if (!templateNome.trim()) return
    setTemplateSaving(true)
    try {
      const dir = await el().joinPath(vaultPath, templatesDir || 'templates')
      const filename = templateNome.trim().replace(/[/\\?%*:|"<>]/g, '-') + '.md'
      const filePath = await el().joinPath(dir, filename)
      // Se renomeou o template, deleta o antigo
      if (templateEditando && templateEditando !== filename) {
        try { await el().deleteFile(await el().joinPath(dir, templateEditando)) } catch {}
      }
      await el().writeFile(filePath, templateConteudo)
      await carregarTemplates()
      cancelarEdicao()
    } catch (e) { console.error('Erro ao salvar template:', e) }
    finally { setTemplateSaving(false) }
  }

  async function deletarTemplate(filename) {
    if (!confirm(`Deletar template "${filename.replace('.md', '')}"?`)) return
    try {
      const dir = await el().joinPath(vaultPath, templatesDir || 'templates')
      await el().deleteFile(await el().joinPath(dir, filename))
      await carregarTemplates()
      if (templateEditando === filename) cancelarEdicao()
    } catch (e) { console.error('Erro ao deletar template:', e) }
  }

  function cancelarEdicao() {
    setTemplateEditando(null)
    setTemplateNovo(false)
    setTemplateNome('')
    setTemplateConteudo('')
  }

  // ── Selecionar pasta Obsidian ──────────────────────────────────────────────
  async function selecionarPasta() {
    const pasta = await el().openFolder()
    if (!pasta) return

    setObsidianPath(pasta)
    setArquivos([])
    setResultados(null)
    setProgresso(0)
    setEscaneando(true)

    try {
      const lista = await scanObsidianVault(pasta)
      setArquivos(lista)
    } catch (err) {
      console.error('Erro ao escanear vault Obsidian:', err)
      setArquivos([])
    } finally {
      setEscaneando(false)
    }
  }

  // ── Calcular cadernos únicos do vault Obsidian escaneado ─────────────────
  const cadernosObsidian = [...new Set(arquivos.map(a => a.caderno))].sort()

  // ── Iniciar importação ─────────────────────────────────────────────────────
  async function iniciarImport() {
    if (!vaultPath || arquivos.length === 0) return

    abortRef.current = false
    setImportando(true)
    setProgresso(0)
    setResultados(null)

    let importados = 0, ignorados = 0, erros = []

    for (let i = 0; i < arquivos.length; i++) {
      if (abortRef.current) break

      const { filePath, caderno, subpasta } = arquivos[i]
      const nomeArquivo = filePath.split(/[/\\]/).pop()
      setArquivoAtual(nomeArquivo)
      setProgresso(i + 1)

      const resultado = await importarArquivo(filePath, caderno, vaultPath, { sobrescrever, subpasta })
      if (resultado.status === 'imported') importados++
      else if (resultado.status === 'skipped') ignorados++
      else erros.push(resultado)
    }

    setImportando(false)
    setArquivoAtual('')
    setResultados({ importados, ignorados, erros })
  }

  function reiniciar() {
    setObsidianPath(null)
    setArquivos([])
    setResultados(null)
    setProgresso(0)
    abortRef.current = false
  }

  // ── Limpar todos os dados do vault ─────────────────────────────────────────
  async function limparTodosOsDados() {
    if (!vaultPath) return
    setLimpandoDados(true)
    try {
      // Lista todas as pastas de cadernos (não reservadas)
      const dirs = await el().readdir(vaultPath, { dirsOnly: true })
      const cadernoDirs = (dirs || []).filter(d =>
        d !== 'meses' && d !== (templatesDir || 'templates') && !d.startsWith('.')
      )

      for (const cadernoDir of cadernoDirs) {
        // Usa readdirRecursive para pegar subpastas
        try {
          const allPaths = await el().readdirRecursive(vaultPath).catch(async () => {
            // fallback: lista só o topo
            const dirPath = await el().joinPath(vaultPath, cadernoDir)
            const files = await el().readdir(dirPath)
            return (files || [])
              .filter(f => f.endsWith('.md'))
              .map(f => el().joinPath(vaultPath, cadernoDir, f))
          })
          const cadernoNorm = cadernoDir.normalize ? cadernoDir.normalize('NFC') : cadernoDir
          const mdFiles = allPaths.filter(p => {
            const norm = (p.normalize ? p.normalize('NFC') : p)
            const rel = norm.replace(vaultPath.normalize ? vaultPath.normalize('NFC') : vaultPath, '').replace(/^[/\\]/, '')
            return rel.startsWith(cadernoNorm) && rel.endsWith('.md')
          })
          for (const filePath of mdFiles) {
            try { await el().deleteFile(filePath) } catch {}
          }
        } catch {}
      }
      setDadosLimpos(true)
      setConfirmLimpar(false)
      feedbackTimers.current.push(setTimeout(() => setDadosLimpos(false), 3000))
    } catch (err) {
      console.error('Erro ao limpar dados:', err)
    } finally {
      setLimpandoDados(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-bg dark:bg-bg-dark">
      <div className="max-w-2xl mx-auto px-8 py-10">

        {/* Cabeçalho */}
        <h1 className="font-serif text-2xl font-medium text-ink dark:text-ink-dark mb-1">
          Configurações
        </h1>
        <p className="text-sm text-ink-3 dark:text-ink-dark3 mb-10">
          Personalize o Paraverso e gerencie seus dados.
        </p>

        {/* ── Seção: Aparência ─────────────────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
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
            </div>
            <div>
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">Aparência</h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">Tema e textura de fundo do editor.</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Tema */}
            <div>
              <label className="text-sm text-ink-2 dark:text-ink-dark2 mb-1.5 block">Tema</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { if (dark) toggleTheme() }}
                  className={`text-sm px-4 py-1.5 rounded-lg border transition-colors ${
                    !dark
                      ? 'border-accent dark:border-accent-dark text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10'
                      : 'border-bdr dark:border-bdr-dark text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark'
                  }`}
                >Claro</button>
                <button
                  onClick={() => { if (!dark) toggleTheme() }}
                  className={`text-sm px-4 py-1.5 rounded-lg border transition-colors ${
                    dark
                      ? 'border-accent dark:border-accent-dark text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10'
                      : 'border-bdr dark:border-bdr-dark text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark'
                  }`}
                >Escuro</button>
              </div>
            </div>

            {/* Textura */}
            <div>
              <label className="text-sm text-ink-2 dark:text-ink-dark2 mb-1.5 block">Textura do editor</label>
              <div className="flex gap-2">
                {[
                  { value: 'none', label: 'Nenhuma' },
                  { value: 'dots', label: 'Pontilhado' },
                  { value: 'grid', label: 'Grade' },
                ].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTexturaTo(t.value)}
                    className={`text-sm px-4 py-1.5 rounded-lg border transition-colors ${
                      textura === t.value
                        ? 'border-accent dark:border-accent-dark text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10'
                        : 'border-bdr dark:border-bdr-dark text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >{t.label}</button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Seção: Importar do Obsidian ────────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Importar do Obsidian
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                Selecione a pasta do seu vault Obsidian. Todas as notas (.md) serão
                importadas mantendo a estrutura de pastas como cadernos.
              </p>
            </div>
          </div>

          {/* Estado inicial — sem pasta selecionada */}
          {!obsidianPath && !escaneando && (
            <button
              onClick={selecionarPasta}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-accent dark:bg-accent-dark text-white font-medium hover:opacity-90 transition-opacity"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Selecionar pasta do Obsidian
            </button>
          )}

          {/* Escaneando */}
          {escaneando && (
            <div className="flex items-center gap-3 py-3">
              <div className="w-4 h-4 border-2 border-accent dark:border-accent-dark border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-ink-2 dark:text-ink-dark2">Escaneando notas...</span>
            </div>
          )}

          {/* Pasta selecionada — preview antes de importar */}
          {obsidianPath && !escaneando && !importando && !resultados && arquivos.length > 0 && (
            <div>
              {/* Info da pasta */}
              <div className="flex items-center gap-2 text-xs text-ink-3 dark:text-ink-dark3 mb-3 font-mono bg-bg dark:bg-bg-dark rounded-lg px-3 py-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="truncate">{obsidianPath}</span>
              </div>

              {/* Estatísticas */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-bg dark:bg-bg-dark rounded-lg p-3 text-center">
                  <div className="text-2xl font-serif font-medium text-ink dark:text-ink-dark">{arquivos.length}</div>
                  <div className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">notas encontradas</div>
                </div>
                <div className="bg-bg dark:bg-bg-dark rounded-lg p-3 text-center">
                  <div className="text-2xl font-serif font-medium text-ink dark:text-ink-dark">{cadernosObsidian.length}</div>
                  <div className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">cadernos</div>
                </div>
              </div>

              {/* Lista de cadernos */}
              <div className="mb-4 bg-bg dark:bg-bg-dark rounded-lg p-3">
                <p className="text-xs font-medium text-ink-2 dark:text-ink-dark2 mb-2">Cadernos que serão criados:</p>
                <div className="flex flex-wrap gap-1.5">
                  {cadernosObsidian.map(c => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-md bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark">
                      {c}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-ink-3/60 dark:text-ink-dark3/60 mt-2">
                  {sobrescrever
                    ? 'Notas existentes serão atualizadas com o conteúdo mais recente.'
                    : 'Notas já existentes no Paraverso serão ignoradas (sem duplicatas).'}
                </p>
              </div>

              {/* Toggle sobrescrever */}
              <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none">
                <button
                  role="switch"
                  aria-checked={sobrescrever}
                  onClick={() => setSobrescrever(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                    sobrescrever ? 'bg-accent dark:bg-accent-dark' : 'bg-bdr dark:bg-bdr-dark'
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    sobrescrever ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
                <span className="text-sm text-ink-2 dark:text-ink-dark2">
                  Sobrescrever notas existentes
                </span>
              </label>

              {/* Ações */}
              <div className="flex items-center gap-3">
                <button
                  onClick={iniciarImport}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-accent dark:bg-accent-dark text-white font-medium hover:opacity-90 transition-opacity"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="16 16 12 12 8 16"/>
                    <line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                  {sobrescrever ? `Re-importar ${arquivos.length} notas` : `Importar ${arquivos.length} notas`}
                </button>
                <button
                  onClick={reiniciar}
                  className="text-sm text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Pasta sem notas */}
          {obsidianPath && !escaneando && !importando && !resultados && arquivos.length === 0 && (
            <div>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mb-3">
                Nenhuma nota .md encontrada nessa pasta.
              </p>
              <button
                onClick={reiniciar}
                className="text-sm text-accent dark:text-accent-dark hover:underline"
              >
                Escolher outra pasta
              </button>
            </div>
          )}

          {/* Importando — progresso */}
          {importando && (
            <div>
              <div className="flex items-center justify-between text-xs text-ink-2 dark:text-ink-dark2 mb-2">
                <span>Importando notas...</span>
                <span className="font-mono">{progresso} / {arquivos.length}</span>
              </div>

              {/* Barra de progresso */}
              <div className="h-1.5 bg-bg-2 dark:bg-bg-dark2 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-accent dark:bg-accent-dark rounded-full transition-all duration-200"
                  style={{ width: `${(progresso / arquivos.length) * 100}%` }}
                />
              </div>

              <p className="text-xs text-ink-3 dark:text-ink-dark3 font-mono truncate">
                {arquivoAtual}
              </p>

              <button
                onClick={() => { abortRef.current = true }}
                className="mt-3 text-xs text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
              >
                Cancelar importação
              </button>
            </div>
          )}

          {/* Concluído */}
          {resultados && (
            <div>
              {/* Ícone de sucesso */}
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-green-600 dark:text-green-400">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="text-sm font-medium text-ink dark:text-ink-dark">
                  Importação concluída
                </span>
              </div>

              {/* Resultados */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-green-500/8 dark:bg-green-400/8 border border-green-500/20 dark:border-green-400/20 rounded-lg p-3 text-center">
                  <div className="text-xl font-serif font-medium text-green-700 dark:text-green-400">
                    {resultados.importados}
                  </div>
                  <div className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">importadas</div>
                </div>
                <div className="bg-bg dark:bg-bg-dark rounded-lg p-3 text-center">
                  <div className="text-xl font-serif font-medium text-ink-2 dark:text-ink-dark2">
                    {resultados.ignorados}
                  </div>
                  <div className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">ignoradas</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${resultados.erros.length > 0 ? 'bg-red-500/8 border border-red-500/20' : 'bg-bg dark:bg-bg-dark'}`}>
                  <div className={`text-xl font-serif font-medium ${resultados.erros.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-ink-2 dark:text-ink-dark2'}`}>
                    {resultados.erros.length}
                  </div>
                  <div className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">erros</div>
                </div>
              </div>

              {/* Erros (se houver) */}
              {resultados.erros.length > 0 && (
                <details className="mb-4">
                  <summary className="text-xs text-ink-3 dark:text-ink-dark3 cursor-pointer hover:text-ink dark:hover:text-ink-dark">
                    Ver erros ({resultados.erros.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {resultados.erros.map((e, i) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400 font-mono">
                        {e.titulo}: {e.error}
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <p className="text-xs text-ink-3 dark:text-ink-dark3 mb-4">
                As notas importadas já estão disponíveis na aba Notas.
                Vá para <strong className="text-ink-2 dark:text-ink-dark2">Notas</strong> para começar a explorar.
              </p>

              <button
                onClick={reiniciar}
                className="text-sm text-accent dark:text-accent-dark hover:underline"
              >
                Importar outro vault
              </button>
            </div>
          )}
        </section>

        {/* ── Seção: Pasta padrão para novas notas ─────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Pasta padrão para novas notas
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                Novas notas criadas com <kbd className="text-xs bg-bg-2 dark:bg-bg-dark2 px-1.5 py-0.5 rounded border border-bdr dark:border-bdr-dark font-mono">⌘N</kbd> irão aparecer nessa pasta.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={defaultCaderno}
              onChange={e => salvarDefaultCaderno(e.target.value)}
              className="flex-1 bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
            >
              <option value="">— Usar caderno ativo —</option>
              {cadernos.map(c => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
            {savedCaderno && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Salvo
              </span>
            )}
          </div>
        </section>

        {/* ── Seção: Pasta para notas diárias ──────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Pasta para notas diárias
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                O botão de diário cria uma nota do dia nessa pasta. O nome da nota segue o formato da data atual.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={journalCaderno}
              onChange={e => salvarJournalCaderno(e.target.value)}
              className="flex-1 bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
            >
              <option value="">— Usar caderno ativo —</option>
              {cadernos.map(c => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
            {savedJournal && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Salvo
              </span>
            )}
          </div>
        </section>

        {/* ── Seção: Pasta de templates ─────────────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Pasta de templates
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                Escolha qual pasta do vault contém os seus templates (⌘T). Ela fica visível
                na barra lateral como um caderno normal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {topDirs.length > 0 ? (
              <select
                value={templatesDir}
                onChange={e => salvarTemplatesDir(e.target.value)}
                className="flex-1 bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
              >
                {topDirs.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={templatesDir}
                onChange={e => setTemplatesDirState(e.target.value)}
                onBlur={e => salvarTemplatesDir(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarTemplatesDir(e.target.value)}
                placeholder="templates"
                className="flex-1 bg-bg dark:bg-bg-dark border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-sm text-ink dark:text-ink-dark focus:outline-none focus:border-accent dark:focus:border-accent-dark transition-colors"
              />
            )}
            {savedTemplates && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Salvo
              </span>
            )}
          </div>

          <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-2">
            Essa pasta não aparece como caderno de notas. Use-a para guardar templates (.md) que serão listados no ⌘T.
          </p>
          {/* Gerenciador de templates */}
          <div className="mt-6 pt-5 border-t border-bdr dark:border-bdr-dark">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-ink dark:text-ink-dark">Templates</h3>
                <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">
                  Crie e edite templates disponíveis no Cmd+T
                </p>
              </div>
              <button
                onClick={() => { setTemplateNovo(true); setTemplateEditando(null); setTemplateNome(''); setTemplateConteudo('') }}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 dark:bg-accent-dark/10 text-accent dark:text-accent-dark hover:bg-accent/20 transition-colors"
              >
                + Novo template
              </button>
            </div>

            {/* Editor de template */}
            {(templateNovo || templateEditando) && (
              <div className="mb-4 p-3 rounded-xl border border-bdr dark:border-bdr-dark bg-bg dark:bg-bg-dark space-y-3">
                <input
                  type="text"
                  value={templateNome}
                  onChange={e => setTemplateNome(e.target.value)}
                  placeholder="Nome do template"
                  className="w-full text-sm bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-ink dark:text-ink-dark placeholder:text-ink-3 dark:placeholder:text-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark"
                />
                <textarea
                  value={templateConteudo}
                  onChange={e => setTemplateConteudo(e.target.value)}
                  placeholder={'Conteúdo em markdown...\n\nVariáveis disponíveis:\n{{date}} — data atual\n{{time}} — hora atual\n{{Title}} — título da nota (como H1)'}
                  rows={12}
                  className="w-full text-sm font-mono bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark rounded-lg px-3 py-2 text-ink dark:text-ink-dark placeholder:text-ink-3 dark:placeholder:text-ink-dark3 focus:outline-none focus:border-accent dark:focus:border-accent-dark resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={cancelarEdicao}
                    className="text-xs px-3 py-1.5 rounded-lg border border-bdr dark:border-bdr-dark text-ink-3 dark:text-ink-dark3 hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarTemplate}
                    disabled={!templateNome.trim() || templateSaving}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent dark:bg-accent-dark text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                  >
                    {templateSaving ? 'Salvando…' : 'Salvar template'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista */}
            {templatesList.length === 0 && !templateNovo && (
              <p className="text-xs text-ink-3 dark:text-ink-dark3 py-3 text-center">
                Nenhum template ainda. Crie o primeiro!
              </p>
            )}
            {templatesList.map(t => (
              <div key={t.filename} className="flex items-center gap-2 py-2 border-b border-bdr dark:border-bdr-dark last:border-0 group">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0 text-ink-3 dark:text-ink-dark3">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="flex-1 text-sm text-ink dark:text-ink-dark">{t.titulo}</span>
                <button onClick={() => editarTemplate(t.filename)} className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-accent dark:hover:text-accent-dark opacity-0 group-hover:opacity-100 transition-all px-2">Editar</button>
                <button onClick={() => deletarTemplate(t.filename)} className="text-xs text-ink-3 dark:text-ink-dark3 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all px-2">Deletar</button>
              </div>
            ))}
          </div>
        </section>

        {/* ── Seção: Atalhos de teclado ─────────────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Atalhos de teclado
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                Todos os atalhos disponíveis no Paraverso.
              </p>
            </div>
          </div>

          <div className="divide-y divide-bdr-2 dark:divide-bdr-dark2">
            {ATALHOS.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink-2 dark:text-ink-dark2">{a.desc}</span>
                <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                  {a.teclas.map((t, j) => (
                    <kbd
                      key={j}
                      className="text-xs px-1.5 py-0.5 rounded bg-bg-2 dark:bg-bg-dark2 border border-bdr dark:border-bdr-dark text-ink-2 dark:text-ink-dark2 font-mono min-w-[22px] text-center"
                    >
                      {t}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Seção: Vault atual ────────────────────────────────────────────── */}
        <section className="bg-surface dark:bg-surface-dark border border-bdr dark:border-bdr-dark rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent-dark/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent dark:text-accent-dark">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Pasta do vault
              </h2>
              <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-0.5">
                A pasta onde todos os seus arquivos .md ficam armazenados.
              </p>
              {vaultPath ? (
                <p className="text-xs font-mono text-ink-2 dark:text-ink-dark2 mt-2 bg-bg dark:bg-bg-dark rounded px-2 py-1.5 truncate">
                  {vaultPath}
                </p>
              ) : (
                <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-2 italic">Nenhum vault configurado.</p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={changeVault}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-bdr dark:border-bdr-dark text-ink-2 dark:text-ink-dark2 hover:border-accent dark:hover:border-accent-dark hover:text-accent dark:hover:text-accent-dark transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  {vaultPath ? 'Trocar pasta' : 'Escolher pasta'}
                </button>
              </div>
              <p className="text-xs text-ink-3 dark:text-ink-dark3 mt-2 opacity-70">
                Trocar a pasta recarrega o app com o novo vault.
              </p>
            </div>
          </div>
        </section>

        {/* ── Zona de perigo: Limpar notas ─────────────────────────────────── */}
        <section className="border border-red-500/20 dark:border-red-400/20 rounded-xl p-6 bg-red-500/3 dark:bg-red-400/3">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 dark:bg-red-400/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 dark:text-red-400">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-medium text-ink dark:text-ink-dark">
                Limpar todas as notas
              </h2>
              <p className="text-sm text-ink-3 dark:text-ink-dark3 mt-0.5">
                Remove todos os arquivos .md dos cadernos do vault atual. Use antes de re-importar
                para garantir um estado limpo. Esta ação não apaga os dados mensais.
              </p>
            </div>
          </div>

          {dadosLimpos ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Notas removidas. Você pode re-importar agora.
            </div>
          ) : !confirmLimpar ? (
            <button
              onClick={() => setConfirmLimpar(true)}
              disabled={!vaultPath}
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-red-500/30 dark:border-red-400/30 text-red-600 dark:text-red-400 hover:bg-red-500/8 dark:hover:bg-red-400/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Limpar todas as notas
            </button>
          ) : (
            <div className="bg-red-500/6 dark:bg-red-400/6 border border-red-500/20 dark:border-red-400/20 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-3">
                Tem certeza? Esta ação não pode ser desfeita.
              </p>
              <p className="text-xs text-ink-3 dark:text-ink-dark3 mb-3">
                Todos os arquivos .md dos cadernos serão deletados permanentemente do disco.
                Os dados da Aba Mês (pasta <code className="font-mono">meses/</code>) serão preservados.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={limparTodosOsDados}
                  disabled={limpandoDados}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-red-600 dark:bg-red-500 text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {limpandoDados ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Limpando...
                    </>
                  ) : (
                    'Sim, limpar tudo'
                  )}
                </button>
                <button
                  onClick={() => setConfirmLimpar(false)}
                  disabled={limpandoDados}
                  className="text-sm text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
