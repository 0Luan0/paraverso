/**
 * vault/monthIO.js — Monthly data CRUD.
 *
 * Composes data from multiple sources:
 * - Month config (meses/{YYYY-MM}/{Month}.md) → habit names, active categories
 * - Daily notes (meses/{YYYY-MM}/{N} {mês} {ano}.md) → per-day habits + memo
 * - Category folders (meses/{categoria}/) → meta items
 * - Resumo note (meses/{YYYY-MM}/Resumo {Month} {Year}.md) → month summary
 *
 * Returns the same mesObj shape that UI components expect.
 */

import { el } from './shared.js'
import { mesId, monthFolderName } from '../mesUtils.js'
import { readMonthConfig, saveMonthConfig, readResumoNote, saveResumoNote } from './monthConfig.js'
import { readMonthDays, ensureDailyNote, writeDayHabits, writeDayMemo } from './dailyNoteIO.js'
import { readMetas, createCategory, createMetaItem, toggleMetaItem, deleteMetaItem, deleteCategory } from './metaFolderIO.js'
import { parseMdFile } from './yamlUtils.js'

// ── Main read/write ──────────────────────────────────────────────────────────

export async function getMesPath(vaultPath, ano, mes) {
  return el().joinPath(vaultPath, 'meses', monthFolderName(ano, mes))
}

/**
 * Load all month data by composing from multiple file sources.
 * Returns the same mesObj shape as before — UI components don't change.
 */
export async function getMonth(vaultPath, ano, mes) {
  // Migrate old format if needed (old YYYY-MM.md at meses root)
  await migrateIfNeeded(vaultPath, ano, mes)

  // 1. Read month config (habitos, categorias)
  const config = await readMonthConfig(vaultPath, ano, mes)

  // 2. Read daily notes → build dias[]
  const dias = await readMonthDays(vaultPath, ano, mes, config.habitos)

  // 3. Read category folders → build metas[]
  const metas = await readMetas(vaultPath, config.categorias)

  // 4. Read resumo note
  const resumo = await readResumoNote(vaultPath, ano, mes)

  return {
    id: mesId(ano, mes),
    ano,
    mes,
    habitos: config.habitos,
    dias,
    metas,
    resumo,
  }
}

/**
 * Save month-level config only (habit names + active categories).
 * Day-level data is saved directly to daily notes by the UI components.
 */
export async function saveMonth(vaultPath, mesObj) {
  await saveMonthConfig(vaultPath, mesObj.ano, mesObj.mes, {
    habitos: mesObj.habitos,
    categorias: mesObj.metas.map(m => m.categoria),
  })
}

/**
 * Save a single day's data to its daily note.
 * Creates the daily note if it doesn't exist.
 */
export async function saveDayFromGrid(vaultPath, ano, mes, dia, habitoNames, habitStates, memo) {
  const path = await ensureDailyNote(vaultPath, ano, mes, dia, habitoNames)
  if (habitStates && habitStates.length > 0) {
    await writeDayHabits(vaultPath, path, habitoNames, habitStates)
  }
  if (memo !== undefined) {
    await writeDayMemo(vaultPath, path, memo)
  }
}

/**
 * Get all months by scanning meses/ for monthly subfolders.
 */
export async function getAllMonths(vaultPath) {
  const mesesDir = await el().joinPath(vaultPath, 'meses')
  let entries = []
  try {
    entries = (await el().readdir(mesesDir, { dirsOnly: true })) || []
  } catch { return [] }

  const meses = []
  for (const entry of entries) {
    // Monthly folders match YYYY-MM pattern
    const match = entry.match(/^(\d{4})-(\d{2})$/)
    if (!match) continue

    const ano = parseInt(match[1], 10)
    const mes = parseInt(match[2], 10)
    try {
      const mesObj = await getMonth(vaultPath, ano, mes)
      meses.push(mesObj)
    } catch { /* skip corrupt */ }
  }
  return meses
}

// Re-export IO functions for direct use by components
export { ensureDailyNote, writeDayHabits, writeDayMemo } from './dailyNoteIO.js'
export { saveResumoNote } from './monthConfig.js'
export { createCategory, createMetaItem, toggleMetaItem, deleteMetaItem, deleteCategory } from './metaFolderIO.js'

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * Check for old format (meses/YYYY-MM.md) and migrate to folder structure.
 * Runs once per month on first load after update.
 */
async function migrateIfNeeded(vaultPath, ano, mes) {
  const oldFilename = `${mesId(ano, mes)}.md`
  const oldPath = await el().joinPath(vaultPath, 'meses', oldFilename)

  const exists = await el().exists(oldPath)
  if (!exists) return

  console.info(`[monthIO] migrating ${oldFilename} → folder structure...`)

  try {
    const raw = await el().readFile(oldPath)
    const { frontmatter, body } = parseMdFile(raw)
    if (!frontmatter?.id) return

    // Merge resumo from frontmatter or body
    const resumo = frontmatter.resumo || body?.trim() || ''
    const habitos = frontmatter.habitos || []
    const dias = frontmatter.dias || []
    const metas = frontmatter.metas || []

    // 1. Create month folder + config
    const config = {
      habitos,
      categorias: metas.map(m => m.categoria),
    }
    await saveMonthConfig(vaultPath, ano, mes, config)

    // 2. Create daily notes for days with data
    for (const dia of dias) {
      const hasContent = dia.memo || (dia.habitos && dia.habitos.some(h => h !== 0))
      if (!hasContent) continue

      const path = await ensureDailyNote(vaultPath, ano, mes, dia.n, habitos)
      if (dia.habitos && dia.habitos.length > 0 && dia.habitos.some(h => h !== 0)) {
        await writeDayHabits(vaultPath, path, habitos, dia.habitos)
      }
      if (dia.memo) {
        await writeDayMemo(vaultPath, path, dia.memo)
      }
    }

    // 3. Create category folders + meta item notes
    for (const meta of metas) {
      const dirPath = await el().joinPath(vaultPath, 'meses', meta.categoria)
      try { await el().mkdir(dirPath) } catch { /* exists */ }

      for (const item of (meta.itens || [])) {
        await createMetaItem(vaultPath, meta.categoria, item.texto)
        if (item.feito) {
          await toggleMetaItem(vaultPath, meta.categoria, item.id, true)
        }
      }
    }

    // 4. Create resumo note if exists
    if (resumo) {
      await saveResumoNote(vaultPath, ano, mes, resumo)
    }

    // 5. Delete old file
    await el().deleteFile(oldPath)
    console.info(`[monthIO] migration complete for ${oldFilename}`)
  } catch (err) {
    console.error(`[monthIO] migration failed for ${oldFilename}:`, err)
    // Don't delete old file on failure — preserve data
  }
}
