/**
 * vault/monthConfig.js — Read/write the month config note.
 *
 * Each month has a config file: meses/{YYYY-MM}/{MonthName} {Year}.md
 * It stores only habit names and active category names.
 * All other data lives in daily notes, category folders, and resumo notes.
 */

import { el, sanitizeName } from './shared.js'
import { mesId, monthFolderName, monthConfigTitle, NOMES_MES } from '../mesUtils.js'
import { yamlStr } from './yamlUtils.js'

/**
 * Read the month config file. Creates defaults if file doesn't exist.
 * Returns { habitos: string[], categorias: string[] }
 */
export async function readMonthConfig(vaultPath, ano, mes) {
  const folder = monthFolderName(ano, mes)
  const filename = '_config.md'
  const dirPath = await el().joinPath(vaultPath, 'meses', folder)
  const filePath = await el().joinPath(dirPath, filename)

  const exists = await el().exists(filePath)

  // Migrate old config filename ("Abril 2026.md" → "_config.md")
  if (!exists) {
    const oldFilename = sanitizeName(monthConfigTitle(ano, mes)) + '.md'
    const oldPath = await el().joinPath(dirPath, oldFilename)
    const oldExists = await el().exists(oldPath)
    if (oldExists) {
      const raw = await el().readFile(oldPath)
      const config = parseMonthConfig(raw)
      await writeMonthConfigFile(filePath, ano, mes, config)
      await el().deleteFile(oldPath)
      return config
    }
  }

  if (!exists) {
    // Create with generic starter habits — user customizes via Hábitos button
    const config = {
      habitos: ['Exercício', 'Leitura', 'Foco', 'Saúde'],
      categorias: [],
    }
    try { await el().mkdir(dirPath) } catch { /* already exists */ }
    await writeMonthConfigFile(filePath, ano, mes, config)
    return config
  }

  const raw = await el().readFile(filePath)
  return parseMonthConfig(raw)
}

/**
 * Save the month config file.
 */
export async function saveMonthConfig(vaultPath, ano, mes, config) {
  const folder = monthFolderName(ano, mes)
  const filename = '_config.md'
  const dirPath = await el().joinPath(vaultPath, 'meses', folder)
  const filePath = await el().joinPath(dirPath, filename)

  try { await el().mkdir(dirPath) } catch { /* already exists */ }
  await writeMonthConfigFile(filePath, ano, mes, config)
}

/**
 * Read the resumo note for a month. Returns empty string if not found.
 */
export async function readResumoNote(vaultPath, ano, mes) {
  const folder = monthFolderName(ano, mes)
  const titulo = `Resumo ${NOMES_MES[mes - 1]} ${ano}`
  const filename = sanitizeName(titulo) + '.md'
  const filePath = await el().joinPath(vaultPath, 'meses', folder, filename)

  const exists = await el().exists(filePath)
  if (!exists) return ''

  const raw = await el().readFile(filePath)
  // Extract body after frontmatter
  const fmEnd = raw.indexOf('\n---\n', 4)
  if (fmEnd !== -1) {
    return raw.slice(fmEnd + 5).trim()
  }
  return raw.trim()
}

/**
 * Save the resumo note for a month. Creates if doesn't exist, updates if it does.
 */
export async function saveResumoNote(vaultPath, ano, mes, texto) {
  const folder = monthFolderName(ano, mes)
  const titulo = `Resumo ${NOMES_MES[mes - 1]} ${ano}`
  const filename = sanitizeName(titulo) + '.md'
  const dirPath = await el().joinPath(vaultPath, 'meses', folder)
  const filePath = await el().joinPath(dirPath, filename)

  try { await el().mkdir(dirPath) } catch { /* already exists */ }

  const exists = await el().exists(filePath)
  if (exists) {
    // Update body, preserve frontmatter
    const raw = await el().readFile(filePath)
    const fmEnd = raw.indexOf('\n---\n', 4)
    if (fmEnd !== -1) {
      const fm = raw.slice(0, fmEnd + 5)
      await el().writeFile(filePath, fm + '\n' + texto)
      return
    }
  }

  // Create new resumo note
  const nota = {
    id: crypto.randomUUID(),
    titulo,
    caderno: 'meses',
    subpasta: folder,
    tags: [],
    criadaEm: Date.now(),
    editadaEm: Date.now(),
  }

  const { serializeNoteYaml: serYaml } = await import('./yamlUtils.js')
  const yaml = serYaml(nota)
  await el().writeFile(filePath, yaml + texto)
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Write the month config file. No `id` or `titulo` in YAML — keeps it
 *  invisible to the notes system (parseMdFile needs `id` to index a file). */
async function writeMonthConfigFile(filePath, ano, mes, config) {
  const lines = [
    '---',
    `ano: ${ano}`,
    `mes: ${mes}`,
    'habitos:',
    ...config.habitos.map(h => `  - ${yamlStr(h)}`),
    'categorias:',
    ...(config.categorias.length > 0
      ? config.categorias.map(c => `  - ${yamlStr(c)}`)
      : ['  []']),
    '---',
    '',
  ]

  await el().writeFile(filePath, lines.join('\n'))
}

/** Parse the month config YAML frontmatter. */
function parseMonthConfig(raw) {
  const config = { habitos: [], categorias: [] }

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return config

  const lines = fmMatch[1].split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('habitos:')) {
      const inline = line.slice('habitos:'.length).trim()
      if (inline === '[]') { i++; continue }
      i++
      while (i < lines.length && lines[i].startsWith('  - ')) {
        config.habitos.push(unquote(lines[i].slice(4).trim()))
        i++
      }
      continue
    }

    if (line.startsWith('categorias:')) {
      const inline = line.slice('categorias:'.length).trim()
      if (inline === '[]') { i++; continue }
      i++
      while (i < lines.length && lines[i].startsWith('  - ')) {
        config.categorias.push(unquote(lines[i].slice(4).trim()))
        i++
      }
      continue
    }

    i++
  }

  return config
}

/** Remove YAML quotes from a value. */
function unquote(val) {
  if ((val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))) {
    try { return JSON.parse(val) } catch { return val.slice(1, -1) }
  }
  return val
}
