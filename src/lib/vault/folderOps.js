/**
 * vault/folderOps.js — Folder/notebook CRUD, move, delete, rename propagation.
 */

import { el, RESERVED_DIRS, MACHINE_DIRS, sanitizeName, buildCodeSkipRanges, isInCodeBlock } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { _getAllMdPaths } from './pathUtils.js'

// No default folders — notes live at vault root unless user creates folders
const CADERNOS_PADRAO = []

export async function getNotebooks(vaultPath) {
  const entries = await el().readdir(vaultPath, { dirsOnly: true })
  const existingDirs = (entries || []).filter(e =>
    !RESERVED_DIRS.has(e) && !MACHINE_DIRS.has(e)
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
  if (RESERVED_DIRS.has(fromTop) || MACHINE_DIRS.has(fromTop)) throw new Error(`Pasta reservada não pode ser movida: ${fromTop}`)

  // Only check destination reserved dirs if destination is not vault root
  if (to) {
    const toTop = to.split(/[/\\]/)[0]
    if (RESERVED_DIRS.has(toTop) || MACHINE_DIRS.has(toTop)) throw new Error(`Destino é pasta reservada: ${toTop}`)
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
  if (RESERVED_DIRS.has(topSeg) || MACHINE_DIRS.has(topSeg)) {
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

export async function propagateRename(vaultPath, tituloAntigo, tituloNovo) {
  if (!tituloAntigo || !tituloNovo) return []
  const oldNorm = String(tituloAntigo).normalize('NFC')
  const newNorm = String(tituloNovo).normalize('NFC')
  if (oldNorm === newNorm) return []

  const escaped = oldNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`, 'g')

  const allPaths = await _getAllMdPaths(vaultPath)
  const updated = []
  for (const filePath of allPaths) {
    try {
      const raw = await el().readFile(filePath)
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
      if (pieces.length === 0) continue // all matches were in code blocks
      pieces.push(raw.slice(lastEnd))
      const next = pieces.join('')

      if (next !== raw) {
        await el().writeFile(filePath, next)
        updated.push(filePath)
      }
    } catch (err) {
      console.warn('[propagateRename] falha ao processar', filePath, err?.message)
    }
  }
  return updated
}
