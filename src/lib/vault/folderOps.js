/**
 * vault/folderOps.js — Folder/notebook CRUD, move, delete, rename propagation.
 */

import { el, RESERVED_DIRS, MACHINE_DIRS, SYSTEM_DIRS, sanitizeName, buildCodeSkipRanges, isInCodeBlock } from './shared.js'
import { _getAllMdPaths } from './pathUtils.js'

// No default folders — notes live at vault root unless user creates folders
const CADERNOS_PADRAO = []

export async function getNotebooks(vaultPath) {
  const entries = await el().readdir(vaultPath, { dirsOnly: true })
  const existingDirs = (entries || []).filter(e =>
    !RESERVED_DIRS.has(e) && !MACHINE_DIRS.has(e) && !SYSTEM_DIRS.has(e)
  )

  if (existingDirs.length === 0) {
    for (const nome of CADERNOS_PADRAO) {
      const dirPath = await el().joinPath(vaultPath, sanitizeName(nome))
      await el().mkdir(dirPath)
    }
    return CADERNOS_PADRAO.map((nome, i) => ({ id: nome.toLowerCase(), nome, ordem: i }))
  }

  return existingDirs.map((nome, i) => ({ id: nome.toLowerCase(), nome, ordem: i }))
}

export async function createNotebook(vaultPath, nome) {
  const dirPath = await el().joinPath(vaultPath, sanitizeName(nome))
  await el().mkdir(dirPath)
  return { id: nome.toLowerCase(), nome, ordem: 99 }
}

export async function moveNotebook(vaultPath, fromRelPath, toRelPath) {
  const from = (fromRelPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  const to   = (toRelPath   || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  // from is required; to can be empty (= promote to vault root)
  if (!from) throw new Error('Caminho de origem inválido')
  if (from === to) return { from, to, noop: true }

  const fromTop = from.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(fromTop) || MACHINE_DIRS.has(fromTop) || SYSTEM_DIRS.has(fromTop)) {
    throw new Error(`Pasta reservada não pode ser movida: ${fromTop}`)
  }

  // Only check destination reserved dirs if destination is not vault root
  if (to) {
    const toTop = to.split(/[/\\]/)[0]
    if (RESERVED_DIRS.has(toTop) || MACHINE_DIRS.has(toTop) || SYSTEM_DIRS.has(toTop)) {
      throw new Error(`Destino é pasta reservada: ${toTop}`)
    }
  }

  // Templates folder: allowed to move/delete (UI handles confirmation)

  // Cycle detection: can't move folder into itself or its children
  if (to && (to === from || to.startsWith(from + '/') || to.startsWith(from + '\\'))) {
    throw new Error('Não é possível mover uma pasta pra dentro dela mesma')
  }

  const fromAbs = await el().joinPath(vaultPath, ...from.split(/[/\\]/))
  const toAbs = to
    ? await el().joinPath(vaultPath, ...to.split(/[/\\]/))
    : await el().joinPath(vaultPath, from.split(/[/\\]/).pop()) // promote: use basename at root

  if (!(await el().exists(fromAbs))) {
    throw new Error(`Pasta origem não encontrada: ${from}`)
  }
  if (await el().exists(toAbs)) {
    throw new Error(`Já existe uma pasta em ${to || from.split(/[/\\]/).pop()}`)
  }

  await el().rename(fromAbs, toAbs)
  return { from, to: to || from.split(/[/\\]/).pop(), noop: false }
}

const CADERNO_CONFIG_KEYS = ['journalCaderno', 'defaultCaderno', 'templatesDir']

export async function remapCadernoConfigs(fromRelPath, toRelPath) {
  const updates = []
  const from = (fromRelPath || '').replace(/^[/\\]+|[/\\]+$/g, '')
  const to   = (toRelPath   || '').replace(/^[/\\]+|[/\\]+$/g, '')
  if (!from || !to || from === to) return updates

  for (const key of CADERNO_CONFIG_KEYS) {
    const current = await el().getConfig?.(key)
    if (!current || typeof current !== 'string') continue
    const norm = current.replace(/^[/\\]+|[/\\]+$/g, '')
    let next = null
    if (norm === from) {
      next = to
    } else if (norm.startsWith(from + '/') || norm.startsWith(from + '\\')) {
      next = to + norm.slice(from.length)
    }
    if (next && next !== current) {
      await el().setConfig?.(key, next)
      updates.push({ key, from: current, to: next })
    }
  }
  return updates
}

export async function deleteNotebook(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) throw new Error('Path vazio')

  const topSeg = rel.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(topSeg) || MACHINE_DIRS.has(topSeg) || SYSTEM_DIRS.has(topSeg)) {
    throw new Error(`Pasta reservada não pode ser deletada: ${topSeg}`)
  }
  // Templates folder: allowed to delete (UI already shows confirmation dialog)

  const absPath = await el().joinPath(vaultPath, ...rel.split(/[/\\]/))
  if (!(await el().exists(absPath))) {
    throw new Error(`Pasta não encontrada: ${rel}`)
  }
  await el().rmrf(absPath)
  return true
}

export async function createSubfolder(vaultPath, parentRelPath, nome) {
  const nomeSane = sanitizeName(nome)
  if (!nomeSane || nomeSane === 'sem-titulo') throw new Error('Nome inválido')

  const parent = (parentRelPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  const parentTop = parent.split(/[/\\]/)[0]
  // Allow creating subfolders inside _machine (it's a normal folder for CRUD)
  if (parentTop && RESERVED_DIRS.has(parentTop)) {
    throw new Error(`Pasta reservada: ${parentTop}`)
  }

  const partes = parent ? [...parent.split(/[/\\]/), nomeSane] : [nomeSane]
  const absPath = await el().joinPath(vaultPath, ...partes)

  if (await el().exists(absPath)) {
    throw new Error(`Já existe uma pasta com esse nome: ${partes.join('/')}`)
  }

  await el().mkdir(absPath)
  return partes.join('/')
}

export async function resolveAbsolutePath(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) return vaultPath
  return el().joinPath(vaultPath, ...rel.split(/[/\\]/))
}

/**
 * Propagates a title rename by rewriting every [[OldTitle]] (and
 * [[OldTitle|alias]]) reference across the vault.
 *
 * Transactional semantics (all-or-nothing):
 *   Phase 1 — dry run. Read every candidate file and build the new
 *             content in memory. Any read error aborts BEFORE any write.
 *   Phase 2 — commit. Write each planned file in sequence. If any write
 *             fails, roll back every already-written file by restoring
 *             its original content, then throw so the caller knows.
 *
 * Why: the previous implementation caught errors per-file and silently
 * continued, leaving a split state where some notes pointed to the new
 * title and others still to the old one — broken wikilinks, duplicate
 * graph nodes. See vaultIntegration.test.js > "rolls back all writes
 * when one file fails" for the contract.
 *
 * Returns: array of absolute paths that were rewritten. Empty if the
 * rename was a no-op or nothing matched.
 * Throws: if the plan phase fails to read a candidate file, or if the
 * commit phase fails mid-way. Thrown errors include rollback status.
 */
export async function propagateRename(vaultPath, tituloAntigo, tituloNovo) {
  if (!tituloAntigo || !tituloNovo) return []
  const oldNorm = String(tituloAntigo).normalize('NFC')
  const newNorm = String(tituloNovo).normalize('NFC')
  if (oldNorm === newNorm) return []

  const escaped = oldNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`, 'g')

  const allPaths = await _getAllMdPaths(vaultPath)

  // ── Phase 1: dry run ──────────────────────────────────────────────────
  // Build a plan of { filePath, original, next } for every file that
  // needs an update. Abort on any read failure — we can't commit safely
  // if we don't know what's in the vault.
  const plan = []
  for (const filePath of allPaths) {
    let raw
    try {
      raw = await el().readFile(filePath)
    } catch (err) {
      throw new Error(`propagateRename: falha ao ler ${filePath}: ${err?.message}`)
    }
    if (!raw || !raw.includes(`[[${oldNorm}`)) continue

    // Skip wikilinks inside code blocks (fenced ``` and inline `)
    const skipRanges = buildCodeSkipRanges(raw)
    re.lastIndex = 0
    let match
    const pieces = []
    let lastEnd = 0
    while ((match = re.exec(raw)) !== null) {
      if (isInCodeBlock(match.index, skipRanges)) continue
      pieces.push(raw.slice(lastEnd, match.index))
      const alias = match[1] || ''
      pieces.push(`[[${newNorm}${alias}]]`)
      lastEnd = match.index + match[0].length
    }
    if (pieces.length === 0) continue // all matches were inside code blocks
    pieces.push(raw.slice(lastEnd))
    const next = pieces.join('')
    if (next === raw) continue
    plan.push({ filePath, original: raw, next })
  }

  if (plan.length === 0) return []

  // ── Phase 2: commit ───────────────────────────────────────────────────
  // Apply each planned write. On failure, restore every already-written
  // file from the snapshot in `plan.original`, then throw.
  const written = []
  try {
    for (const entry of plan) {
      await el().writeFile(entry.filePath, entry.next)
      written.push(entry)
    }
    return plan.map(p => p.filePath)
  } catch (commitErr) {
    const rollbackFailures = []
    for (const entry of written) {
      try {
        await el().writeFile(entry.filePath, entry.original)
      } catch (rbErr) {
        rollbackFailures.push({ filePath: entry.filePath, error: rbErr?.message })
      }
    }
    const suffix = rollbackFailures.length > 0
      ? ` Rollback parcial falhou em ${rollbackFailures.length} arquivo(s) — vault pode estar inconsistente: ${JSON.stringify(rollbackFailures)}`
      : ' Rollback completo — vault restaurado ao estado original.'
    const err = new Error(`propagateRename: falha ao escrever: ${commitErr?.message}.${suffix}`)
    err.rollbackFailures = rollbackFailures
    throw err
  }
}
