/**
 * machineContext.js — Machine Hemisphere service
 *
 * Manages the _machine/ folder inside the vault — the AI's private workspace.
 * Rule: _machine/ → AI reads and writes freely.
 *       Everything else in vault → AI NEVER touches.
 *
 * All file I/O goes through IPC (window.electron.machineContext.*).
 */

const el = () => window.electron

const MACHINE_DIR = '_machine'
const CONTEXTS_DIR = 'contexts'
const TEMPLATES_DIR = 'templates'

// ── Initial content for context files ────────────────────────────────────────

function pessoaContent() {
  const now = new Date().toISOString()
  return `---
type: machine-context
subtype: pessoa
version: 1
updated: ${now}
---

# Contexto — Pessoa

## Estilo de comunicação
[A IA preencherá com o tempo]

## Interesses gerais
[A IA preencherá com o tempo]

## Forma de pensar
[A IA preencherá com o tempo]

## Notas da IA
[A IA preencherá com o tempo]
`
}

function interessesContent() {
  const now = new Date().toISOString()
  return `---
type: machine-context
subtype: interesses
version: 1
updated: ${now}
---

# Contexto — Interesses e Referências

## Livros lidos / referências
[A IA preencherá com o tempo]

## Autores e pensadores
[A IA preencherá com o tempo]

## Áreas de interesse
[A IA preencherá com o tempo]
`
}

// ── Initial content for template files ───────────────────────────────────────

function pesquiseTemplate() {
  return `---
type: machine-template
command: pesquise
---

# Template — Pesquisa Web

Você é um assistente de pesquisa. Ao receber uma solicitação:

1. Pesquise o tema solicitado
2. Leia o contexto em pessoa.md e interesses.md
3. Escreva um resumo que conecte o tema com os interesses da pessoa
4. Use a forma de comunicação descrita no contexto
5. Sugira conexões com referências que a pessoa já conhece

Formato de saída: título, resumo (3-5 parágrafos), conexões com interesses, fontes.
`
}

function brainstormTemplate() {
  return `---
type: machine-template
command: brainstorm
---

# Template — Brainstorm

Você é um parceiro de brainstorm criativo. Ao receber um tema:

1. Leia o contexto em pessoa.md e interesses.md
2. Gere ideias que conectem o tema com os interesses da pessoa
3. Use referências que a pessoa já conhece como ponto de partida
4. Proponha ângulos não-óbvios e conexões interdisciplinares
5. Organize as ideias em clusters temáticos

Formato de saída: tema central, ideias agrupadas, conexões surpreendentes, próximos passos.
`
}

function escritaTemplate() {
  return `---
type: machine-template
command: escrita
---

# Template — Assistente de Escrita

Você é um assistente de escrita. Ao receber uma solicitação:

1. Leia o contexto em pessoa.md e interesses.md
2. Adapte o tom ao estilo de comunicação da pessoa
3. Use referências e vocabulário familiares ao autor
4. Mantenha a voz autêntica — ajude a expressar, não substitua
5. Sugira melhorias estruturais e de clareza

Formato de saída: texto revisado, notas sobre alterações, sugestões opcionais.
`
}

function readmeContent() {
  return `# Hemisfério Máquina

Esta pasta é gerenciada pela IA do Paraverso.
Não edite manualmente a menos que saiba o que está fazendo.
Os arquivos aqui são o "cérebro" da IA — contexto sobre você, templates de resposta.
`
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initializes the _machine/ hemisphere inside the vault.
 * Creates the folder structure and initial files if they don't exist.
 * Returns: { created: boolean, path: string }
 */
export async function initMachineHemisphere(vaultPath) {
  const result = await el().machineContext.init(vaultPath)
  return result
}

/**
 * Loads context for a given command ('pesquise', 'brainstorm', 'escrita').
 * Returns pessoa.md + interesses.md + matching template as a concatenated string
 * ready to be used as AI system prompt.
 */
export async function loadContextForCommand(command, vaultPath) {
  const machinePath = await el().joinPath(vaultPath, MACHINE_DIR)
  const contextsPath = await el().joinPath(machinePath, CONTEXTS_DIR)
  const templatesPath = await el().joinPath(machinePath, TEMPLATES_DIR)

  // Read context files
  const pessoaPath = await el().joinPath(contextsPath, 'pessoa.md')
  const interessesPath = await el().joinPath(contextsPath, 'interesses.md')
  const templatePath = await el().joinPath(templatesPath, `${command}.md`)

  let pessoa = '', interesses = '', template = ''

  try { pessoa = await el().machineContext.readContext(pessoaPath) } catch {}
  try { interesses = await el().machineContext.readContext(interessesPath) } catch {}
  try { template = await el().machineContext.readContext(templatePath) } catch {}

  return [
    '--- CONTEXTO DA PESSOA ---',
    pessoa,
    '',
    '--- INTERESSES E REFERÊNCIAS ---',
    interesses,
    '',
    '--- TEMPLATE DO COMANDO ---',
    template,
  ].join('\n')
}

/**
 * Security guard. Returns true ONLY if filePath is inside vaultPath/_machine/.
 * Uses path resolution via IPC — not string.includes().
 */
export async function isMachinePath(filePath, vaultPath) {
  // Resolve paths via Electron's path.resolve (IPC)
  const machinePath = await el().joinPath(vaultPath, MACHINE_DIR)
  // Normalize both to NFC for macOS compatibility
  const normalizedFile = filePath.normalize('NFC')
  const normalizedMachine = machinePath.normalize('NFC')
  // filePath must start with machinePath + separator
  return normalizedFile.startsWith(normalizedMachine + '/') ||
         normalizedFile.startsWith(normalizedMachine + '\\') ||
         normalizedFile === normalizedMachine
}

/**
 * Writes content to a file inside the machine hemisphere.
 * Throws MACHINE_PATH_VIOLATION if filePath is outside _machine/.
 */
export async function writeContext(filePath, content, vaultPath) {
  const inside = await isMachinePath(filePath, vaultPath)
  if (!inside) {
    throw new Error('MACHINE_PATH_VIOLATION')
  }
  return el().machineContext.writeContext(filePath, content)
}

/**
 * Lists all .md files inside _machine/.
 * Returns: string[]
 */
export async function listMachineFiles(vaultPath) {
  return el().machineContext.listFiles(vaultPath)
}

// ── File content generators (exported for IPC handler use) ───────────────────

export const INITIAL_FILES = {
  [`${CONTEXTS_DIR}/pessoa.md`]: pessoaContent,
  [`${CONTEXTS_DIR}/interesses.md`]: interessesContent,
  [`${TEMPLATES_DIR}/pesquise.md`]: pesquiseTemplate,
  [`${TEMPLATES_DIR}/brainstorm.md`]: brainstormTemplate,
  [`${TEMPLATES_DIR}/escrita.md`]: escritaTemplate,
  ['README.md']: readmeContent,
}
