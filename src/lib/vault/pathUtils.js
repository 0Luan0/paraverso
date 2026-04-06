/**
 * vault/pathUtils.js — Path helpers and file listing for vault.
 * Handles NFC/NFD normalization, RESERVED_DIRS filtering, recursive file search.
 */

import { el, RESERVED_DIRS, sanitizeName } from './shared.js'

export async function joinPath(...parts) {
  return el().joinPath(...parts)
}

/**
 * Checks if filename already exists for a different note (different ID).
 * If so, adds numeric suffix: "name 2", "name 3", etc.
 */
export async function resolveFilenameCollision(dirPath, baseFilename, notaId) {
  let candidate = baseFilename
  let counter = 2
  while (true) {
    const fullPath = await el().joinPath(dirPath, candidate + '.md')
    const exists = await el().exists(fullPath)
    if (!exists) return candidate
    try {
      const raw = await el().readFile(fullPath)
      const idMatch = raw.match(/^id:\s*(.+)$/m)
      if (idMatch && idMatch[1].trim() === notaId) return candidate
    } catch { /* assume conflict if can't read */ }
    candidate = `${baseFilename} ${counter++}`
    if (counter > 100) throw new Error(`Filename collision: could not resolve "${baseFilename}"`)
  }
}

/**
 * Decomposes an absolute file path into parts relative to the vault.
 * Returns [notebook, ...subfolders, filename] or [] if outside vault.
 * Robust to NFC/NFD, trailing slashes, case differences, mixed separators.
 */
export function _relParts(filePath, vaultPath) {
  const fp = filePath.normalize('NFC').replace(/\\/g, '/')
  const vp = vaultPath.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '')

  const fpParts = fp.split('/').filter(Boolean)
  const vpParts = vp.split('/').filter(Boolean)

  if (fpParts.length <= vpParts.length) return []

  for (let i = 0; i < vpParts.length; i++) {
    if (fpParts[i].toLowerCase() !== vpParts[i].toLowerCase()) {
      console.debug('[Vault] _relParts mismatch:', fpParts[i], '!==', vpParts[i])
      return []
    }
  }

  return fpParts.slice(vpParts.length)
}

/**
 * Extracts subfolder path between notebook and file.
 * '/vault/Refs/Videos/note.md' → 'Videos'
 * '/vault/Refs/note.md' → null
 */
export function _subpasta(filePath, vaultPath) {
  const parts = _relParts(filePath, vaultPath)
  if (parts.length >= 3) return parts.slice(1, -1).join('/')
  return null
}

/**
 * Extracts the top-level notebook directory from an absolute file path.
 * '/vault/Notebook/note.md' → 'Notebook'
 * '/vault/note.md' → '' (root-level note)
 */
export function _topDir(filePath, vaultPath) {
  const parts = _relParts(filePath, vaultPath)
  if (parts.length < 2) return ''
  return parts[0] || ''
}

/**
 * Fallback: scans one level of subdirectories via sequential readdir.
 * Used when readdirRecursive is not available.
 */
async function _getAllMdPathsFallback(vaultPath) {
  const topDirs = (await el().readdir(vaultPath, { dirsOnly: true })) || []
  const paths = []

  try {
    const rootFiles = (await el().readdir(vaultPath)) || []
    for (const f of rootFiles) {
      if (f.endsWith('.md')) paths.push(await el().joinPath(vaultPath, f))
    }
  } catch { /* ignore */ }

  for (const dir of topDirs) {
    if (RESERVED_DIRS.has(dir)) continue
    const dirPath = await el().joinPath(vaultPath, dir)

    const files = (await el().readdir(dirPath)) || []
    for (const f of files) {
      if (f.endsWith('.md')) paths.push(await el().joinPath(dirPath, f))
    }

    const subDirs = await el().readdir(dirPath, { dirsOnly: true }).catch(() => [])
    for (const sub of (subDirs || [])) {
      if (RESERVED_DIRS.has(sub)) continue
      const subPath = await el().joinPath(dirPath, sub)
      const subFiles = (await el().readdir(subPath)) || []
      for (const f of subFiles) {
        if (f.endsWith('.md')) paths.push(await el().joinPath(subPath, f))
      }
    }
  }
  return paths
}

/**
 * Lists all .md files in the vault recursively, excluding RESERVED_DIRS.
 */
export async function _getAllMdPaths(vaultPath) {
  let allPaths
  try {
    allPaths = await el().readdirRecursive(vaultPath)
    if (!Array.isArray(allPaths)) throw new Error('readdirRecursive returned invalid value')
  } catch {
    console.warn('[Vault] readdirRecursive unavailable, using fallback. Restart the app for full scan.')
    return _getAllMdPathsFallback(vaultPath)
  }

  return allPaths.filter(p => {
    const topDir = _topDir(p, vaultPath)
    return !RESERVED_DIRS.has(topDir)
  })
}

/**
 * Splits a relative notebook path into { caderno, subpasta }.
 * 'Archive/Codex/Readings' → { caderno: 'Archive', subpasta: 'Codex/Readings' }
 * 'Codex' → { caderno: 'Codex', subpasta: null }
 */
export function splitCadernoPath(relPath) {
  if (!relPath || typeof relPath !== 'string') return { caderno: '', subpasta: null }
  const norm = relPath.replace(/^[/\\]+|[/\\]+$/g, '')
  if (!norm) return { caderno: '', subpasta: null }
  const parts = norm.split(/[/\\]/)
  if (parts.length === 1) return { caderno: parts[0], subpasta: null }
  return { caderno: parts[0], subpasta: parts.slice(1).join('/') }
}
