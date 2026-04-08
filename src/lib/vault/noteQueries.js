/**
 * vault/noteQueries.js — Read-only note queries, backlinks, and templates.
 */

import { el, filenameToId, buildCodeSkipRanges, isInCodeBlock } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { parseMdFile } from './yamlUtils.js'
import { _getAllMdPaths, _topDir, _subpasta, _relativeFolder } from './pathUtils.js'
import { readNote } from './noteIO.js'

// ── Note queries ─────────────────────────────────────────────────────────────

export async function getNotesByNotebook(vaultPath, caderno) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []
  const cadernoNorm = caderno.normalize('NFC')

  for (const filePath of allPaths) {
    // Match notes whose top-level folder equals this caderno
    if (_topDir(filePath, vaultPath) !== cadernoNorm) continue
    try {
      const nota = await readNote(filePath, caderno)
      if (!nota?.id) continue
      // Set unified folder path (e.g. "Projetos/Web") and legacy subpasta for sidebar tree
      const folder = _relativeFolder(filePath, vaultPath)
      const subpasta = _subpasta(filePath, vaultPath)
      notas.push({ ...nota, folder, subpasta })
    } catch { /* skip corrupt */ }
  }
  return notas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
}

/**
 * Returns all subfolder paths (relative to the notebook) that exist on disk.
 * E.g. for notebook "Referências" with subfolder "Livros lidos":
 *   → ['Livros lidos']
 * Recursive: "A/B/C" → ['A', 'A/B', 'A/B/C']
 */
export async function getSubfolders(vaultPath, caderno) {
  if (!caderno) return []
  const results = []
  async function scan(dirPath, prefix) {
    const dirs = await el().readdir(dirPath, { dirsOnly: true }).catch(() => [])
    for (const name of (dirs || [])) {
      if (name.startsWith('.') || name.startsWith('_')) continue
      const rel = prefix ? `${prefix}/${name}` : name
      results.push(rel)
      const sub = await el().joinPath(dirPath, name)
      await scan(sub, rel)
    }
  }
  const notebookPath = await el().joinPath(vaultPath, caderno)
  await scan(notebookPath, '')
  return results
}

export async function getAllNotes(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    const caderno = _topDir(filePath, vaultPath)
    try {
      const nota = await readNote(filePath, caderno)
      if (!nota?.id) continue
      const folder = _relativeFolder(filePath, vaultPath)
      notas.push({ ...nota, folder })
    } catch { /* skip corrupt */ }
  }
  return notas
}

export async function getNotesForGraph(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const wikilinkRe = /\[\[([^\]\n]+)\]\]/g

  const settled = await Promise.allSettled(allPaths.map(async (filePath) => {
    const folder = _relativeFolder(filePath, vaultPath)
    const caderno = _topDir(filePath, vaultPath)
    const raw = await el().readFile(filePath)
    const { frontmatter, body, format } = parseMdFile(raw)
    const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

    const bodyStr = body || ''
    const skipRanges = buildCodeSkipRanges(bodyStr)

    const wikilinks = []
    wikilinkRe.lastIndex = 0
    let m
    while ((m = wikilinkRe.exec(bodyStr)) !== null) {
      if (isInCodeBlock(m.index, skipRanges)) continue
      wikilinks.push(m[1].split('|')[0].trim().normalize('NFC').toLowerCase())
    }

    const id = (format === 'paraverso' || format === 'paraverso-legacy') && frontmatter?.id
      ? String(frontmatter.id) : filename
    let titulo = (frontmatter?.titulo) ? String(frontmatter.titulo) : filename
    if (titulo === filename) {
      const h1 = bodyStr.match(/^#\s+(.+)/m)
      if (h1) titulo = h1[1].trim().normalize('NFC')
    }

    return {
      id,
      titulo: String(titulo),
      folder,
      caderno: String(caderno),
      editadaEm: Number(frontmatter?.editadaEm) || 0,
      _filename: filename,
      wikilinks,
    }
  }))

  for (const r of settled) {
    if (r.status === 'rejected') console.warn('[getNotasParaGrafoVault] arquivo ignorado:', r.reason?.message)
  }

  return settled.filter(r => r.status === 'fulfilled').map(r => r.value)
}

// Metadata cache — avoids full rescan on every QuickSwitcher open / index rebuild
let _metadataCache = { ts: 0, vaultPath: '', result: null }
const METADATA_TTL = 5000

export async function getAllNotesMetadata(vaultPath) {
  // Return cached if fresh and same vault
  if (_metadataCache.result && _metadataCache.vaultPath === vaultPath && Date.now() - _metadataCache.ts < METADATA_TTL) {
    return _metadataCache.result
  }

  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    const folder = _relativeFolder(filePath, vaultPath)
    const caderno = _topDir(filePath, vaultPath)
    try {
      const raw = await el().readFile(filePath)
      const { frontmatter, body, format } = parseMdFile(raw)
      const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

      if ((format === 'paraverso' || format === 'paraverso-legacy') && frontmatter?.id) {
        notas.push({
          id:        String(frontmatter.id),
          titulo:    String(frontmatter.titulo || filename),
          folder,
          caderno:   String(caderno),
          tags:      Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          editadaEm: Number(frontmatter.editadaEm) || 0,
          _filename: filename,
        })
      } else {
        let titulo = filename
        const h1 = body?.match(/^#\s+(.+)/m)
        if (h1) titulo = h1[1].trim().normalize('NFC')
        notas.push({
          id:        filename,
          titulo:    String(titulo),
          folder,
          caderno:   String(caderno),
          tags:      [],
          editadaEm: 0,
          _filename: filename,
        })
      }
    } catch { /* skip */ }
  }
  const sorted = notas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
  _metadataCache = { ts: Date.now(), vaultPath, result: sorted }
  return sorted
}

// ── Backlinks (cached with 5-second TTL) ────────────────────────────────────

const _backlinksCache = new Map() // key: titleLower → { ts, result }
const BACKLINKS_TTL = 5000

/** Clears the backlinks cache. Call after note saves or renames. */
export function invalidateBacklinksCache() { _backlinksCache.clear() }

export async function getBacklinks(vaultPath, titulo) {
  if (!titulo) return []
  const tituloLower = titulo.normalize('NFC').toLowerCase()

  // Return cached result if fresh
  const cached = _backlinksCache.get(tituloLower)
  if (cached && Date.now() - cached.ts < BACKLINKS_TTL) return cached.result

  const allPaths = await _getAllMdPaths(vaultPath)
  const backlinks = []

  for (const filePath of allPaths) {
    try {
      const raw = await el().readFile(filePath)
      if (!raw.includes('[[')) continue
      const rawNorm = raw.normalize('NFC')

      // Parse all wikilinks, skip code blocks, compare case-insensitive
      const skipRanges = buildCodeSkipRanges(rawNorm)
      const wikilinkRe = /\[\[([^\]\n]+)\]\]/g
      let found = false
      let m
      while ((m = wikilinkRe.exec(rawNorm)) !== null) {
        if (isInCodeBlock(m.index, skipRanges)) continue
        const target = m[1].split('|')[0].trim().normalize('NFC').toLowerCase()
        if (target === tituloLower) { found = true; break }
      }
      if (!found) continue

      const folder   = _relativeFolder(filePath, vaultPath)
      const caderno  = _topDir(filePath, vaultPath)
      const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')
      const { frontmatter } = parseMdFile(raw)
      const notaTitulo = frontmatter?.titulo?.normalize('NFC') || filename

      backlinks.push({
        id:        frontmatter?.id || filename,
        titulo:    notaTitulo,
        folder,
        caderno,
        _filename: filename,
      })
    } catch { /* skip corrupt */ }
  }
  _backlinksCache.set(tituloLower, { ts: Date.now(), result: backlinks })
  return backlinks
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function getTemplates(vaultPath) {
  const templatesDir = await el().joinPath(vaultPath, getTemplatesDir())
  const files = await el().readdir(templatesDir).catch(() => [])
  const mdFiles = (files || []).filter(f => f.endsWith('.md'))
  return mdFiles.map(f => ({ filename: f, titulo: filenameToId(f) }))
}

export async function readTemplate(vaultPath, filename) {
  const filePath = await el().joinPath(vaultPath, getTemplatesDir(), filename)
  const raw = await el().readFile(filePath)
  const { body } = parseMdFile(raw)
  return (body || raw).trimStart()
}
