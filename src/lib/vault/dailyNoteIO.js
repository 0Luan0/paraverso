/**
 * vault/dailyNoteIO.js — Read/write/create daily notes for the Month Tab.
 *
 * Daily notes live at: meses/{YYYY-MM}/{dia} {mês} {ano}.md
 * They contain ## Hábitos (checkboxes) and ## Memorável (memo) sections
 * that the Month Tab reads and patches.
 */

import { el, sanitizeName } from './shared.js'
import { serializeNoteYaml } from './yamlUtils.js'
import {
  dailyNoteTitle, monthFolderName, MESES_PT_LOWER, DIAS_SEMANA
} from '../mesUtils.js'

// Habit state codes ↔ checkbox syntax: [ ] empty, [x] done, [-] not done
const STATE_TO_CHECK = { 0: '[ ]', 1: '[x]', 2: '[-]' }
const CHECK_TO_STATE = { ' ': 0, 'x': 1, '-': 2, '~': 2 }

// ── Pure functions (testable) ────────────────────────────────────────────────

/**
 * Parse a daily note's raw content to extract habit states and memo.
 * Only reads ## Hábitos and ## Memorável sections — ignores everything else.
 */
export function readDayData(rawContent, habitoNames) {
  const habitos = new Array(habitoNames.length).fill(0)
  let foundHabits = false
  let memo = ''

  // Parse ## Hábitos section (bounded by --- separator, next ## heading, or EOF)
  const habitMatch = rawContent.match(/## H[aá]bitos\n([\s\S]*?)(?=\n---|\n## |\n*$)/)
  if (habitMatch) {
    const lines = habitMatch[1].split('\n')
    for (const line of lines) {
      const m = line.match(/^- \[([ x~\-])\] (.+)$/)
      if (m) {
        foundHabits = true
        const state = CHECK_TO_STATE[m[1]] ?? 0
        const name = m[2].trim()
        const idx = habitoNames.indexOf(name)
        if (idx !== -1) habitos[idx] = state
      }
    }
  }

  // Parse ## Memorável section — only first non-empty line (it's a one-liner for Month Tab)
  const memoMatch = rawContent.match(/## Memor[aá]vel\n([\s\S]*?)(?=\n## |\n*$)/)
  if (memoMatch) {
    // Take only the first non-empty line as memo
    const firstLine = memoMatch[1].split('\n').find(l => l.trim())
    memo = firstLine?.trim() || ''
  }

  return { habitos: foundHabits ? habitos : [], memo }
}

/**
 * Patch a specific ## section in a note's raw content.
 * Replaces everything between the heading and the next ## (or EOF).
 * If the section doesn't exist, inserts it after the first # heading.
 */
export function patchNoteSection(rawContent, sectionName, newBody) {
  // Try to find and replace existing section
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRe = new RegExp(`(## ${escapedName})\n[\\s\\S]*?(?=\\n## |\\s*$)`)
  const match = rawContent.match(sectionRe)

  if (match) {
    return rawContent.replace(sectionRe, `$1\n${newBody}`)
  }

  // Section not found — insert after first # heading
  const h1End = rawContent.indexOf('\n', rawContent.indexOf('# '))
  if (h1End !== -1) {
    return rawContent.slice(0, h1End + 1) + `\n## ${sectionName}\n${newBody}\n` + rawContent.slice(h1End + 1)
  }

  // No heading found — append
  return rawContent + `\n## ${sectionName}\n${newBody}\n`
}

/**
 * Build the markdown body for a new daily note.
 * Includes H1 with weekday + date, ## Hábitos checklist, ## Memorável section.
 */
export function buildDailyNoteContent(ano, mes, dia, habitoNames) {
  const date = new Date(ano, mes - 1, dia)
  const diaSem = DIAS_SEMANA[date.getDay()]
  const mesNome = MESES_PT_LOWER[mes - 1]

  const lines = [
    `# ${diaSem}, ${dia} de ${mesNome} de ${ano}`,
    '',
    '## Memorável',
    '',
    '',
    '## Hábitos',
    ...habitoNames.map(h => `- [ ] ${h}`),
    '',
    '---',
    '',
  ]

  return lines.join('\n')
}

/**
 * Build habit section body from habit names and states.
 */
export function buildHabitSection(habitoNames, habitStates) {
  return habitoNames.map((name, i) => {
    const state = habitStates[i] ?? 0
    return `- ${STATE_TO_CHECK[state] || '[ ]'} ${name}`
  }).join('\n')
}

// ── Async IO functions ───────────────────────────────────────────────────────

/**
 * Get the absolute path for a daily note. Returns null if file doesn't exist.
 * Path: meses/{YYYY-MM}/{dia} {mês} {ano}.md
 */
export async function getDailyNotePath(vaultPath, ano, mes, dia) {
  const folder = monthFolderName(ano, mes)
  const filename = sanitizeName(dailyNoteTitle(ano, mes, dia)) + '.md'
  const filePath = await el().joinPath(vaultPath, 'meses', folder, filename)
  const exists = await el().exists(filePath)
  return exists ? filePath : null
}

/**
 * Read all daily notes for a month and build the dias[] array.
 * Lists the month folder once, reads only matching daily notes.
 */
export async function readMonthDays(vaultPath, ano, mes, habitoNames) {
  const folder = monthFolderName(ano, mes)
  const dirPath = await el().joinPath(vaultPath, 'meses', folder)

  // List files in month folder
  let files = []
  try {
    files = (await el().readdir(dirPath)) || []
  } catch {
    // Folder doesn't exist yet — no daily notes
  }

  // Build expected daily note filenames for this month
  const diasNoMes = new Date(ano, mes, 0).getDate()
  const nomesDias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  const dayMap = new Map()

  // Build set of expected filenames → day number
  const filenameToDay = new Map()
  for (let n = 1; n <= diasNoMes; n++) {
    const filename = sanitizeName(dailyNoteTitle(ano, mes, n)) + '.md'
    filenameToDay.set(filename, n)
  }

  // Read matching files in parallel (5-10x faster than sequential)
  const matchingFiles = files.filter(f => filenameToDay.has(f))
  await Promise.all(matchingFiles.map(async (file) => {
    const dayNum = filenameToDay.get(file)
    try {
      const filePath = await el().joinPath(dirPath, file)
      const raw = await el().readFile(filePath)
      const { habitos, memo } = readDayData(raw, habitoNames)
      const date = new Date(ano, mes - 1, dayNum)
      dayMap.set(dayNum, {
        n: dayNum,
        letraDia: nomesDias[date.getDay()],
        memo,
        nota: '',
        habitos,
      })
    } catch { /* skip corrupt files */ }
  }))

  // Build full dias array, filling missing days with defaults
  return Array.from({ length: diasNoMes }, (_, i) => {
    const n = i + 1
    if (dayMap.has(n)) return dayMap.get(n)
    const date = new Date(ano, mes - 1, n)
    return { n, letraDia: nomesDias[date.getDay()], memo: '', nota: '', habitos: [] }
  })
}

/**
 * Ensure a daily note exists. Creates one if it doesn't.
 * Returns the absolute file path.
 */
export async function ensureDailyNote(vaultPath, ano, mes, dia, habitoNames) {
  const existing = await getDailyNotePath(vaultPath, ano, mes, dia)
  if (existing) return existing

  // Create month folder if needed
  const folder = monthFolderName(ano, mes)
  const dirPath = await el().joinPath(vaultPath, 'meses', folder)
  try { await el().mkdir(dirPath) } catch { /* already exists */ }

  // Build the note
  const titulo = dailyNoteTitle(ano, mes, dia)
  const nota = {
    id: crypto.randomUUID(),
    titulo,
    caderno: 'meses',
    subpasta: folder,
    tags: [],
    criadaEm: Date.now(),
    editadaEm: Date.now(),
  }

  const body = buildDailyNoteContent(ano, mes, dia, habitoNames)
  const yaml = serializeNoteYaml(nota)
  const filename = sanitizeName(titulo) + '.md'
  const filePath = await el().joinPath(dirPath, filename)
  await el().writeFile(filePath, yaml + body)

  return filePath
}

/**
 * Patch the ## Hábitos section in a daily note.
 * Dispatches a vault-changed event so the Notes tab can refresh.
 */
export async function writeDayHabits(vaultPath, filePath, habitoNames, habitStates) {
  const raw = await el().readFile(filePath)
  const newSection = buildHabitSection(habitoNames, habitStates)
  const patched = patchNoteSection(raw, 'Hábitos', newSection)
  await el().writeFile(filePath, patched)
  notifyVaultChanged(filePath)
}

/**
 * Patch the ## Memorável section in a daily note.
 * Dispatches a vault-changed event so the Notes tab can refresh.
 */
export async function writeDayMemo(vaultPath, filePath, memo) {
  const raw = await el().readFile(filePath)
  const patched = patchNoteSection(raw, 'Memorável', memo || '')
  await el().writeFile(filePath, patched)
  notifyVaultChanged(filePath)
}

/** Notify other tabs that a vault file was changed externally. */
function notifyVaultChanged(filePath) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('paraverso:vault-changed', {
      detail: { filePath }
    }))
  }
}
