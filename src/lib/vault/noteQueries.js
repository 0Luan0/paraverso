/**
 * vault/noteQueries.js — Read-only note queries, backlinks, and templates.
 */

import { el, filenameToId } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { parseMdFile } from './yamlUtils.js'
import { _getAllMdPaths, _topDir, _subpasta } from './pathUtils.js'
import { readNote } from './noteIO.js'

// ── Note queries ─────────────────────────────────────────────────────────────

export async function getNotesByNotebook(vaultPath, caderno) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    if (_topDir(filePath, vaultPath) !== caderno.normalize('NFC')) continue
    try {
      const nota = await readNote(filePath, caderno)
      if (nota?.id) notas.push({ ...nota, subpasta: _subpasta(filePath, vaultPath) })
    } catch { /* skip corrupt */ }
  }
  return notas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
}

export async function getAllNotes(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    const caderno = _topDir(filePath, vaultPath)
    try {
      const nota = await readNote(filePath, caderno)
      if (nota?.id) notas.push(nota)
    } catch { /* skip corrupt */ }
  }
  return notas
}

export async function getNotesForGraph(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const wikilinkRe = /\[\[([^\]\n]+)\]\]/g

  const settled = await Promise.allSettled(allPaths.map(async (filePath) => {
    const caderno = _topDir(filePath, vaultPath)
    const raw = await el().readFile(filePath)
    const { frontmatter, body, format } = parseMdFile(raw)
    const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

    const bodyStr = body || ''
    const skipRanges = []
    const fenceRe = /```[\s\S]*?```/g
    let fm
    while ((fm = fenceRe.exec(bodyStr)) !== null) skipRanges.push([fm.index, fm.index + fm[0].length])
    const inlineRe = /`[^`\n]+`/g
    let im
    while ((im = inlineRe.exec(bodyStr)) !== null) skipRanges.push([im.index, im.index + im[0].length])
    const isInSkip = (pos) => skipRanges.some(([s, e]) => pos >= s && pos < e)

    const wikilinks = []
    wikilinkRe.lastIndex = 0
    let m
    while ((m = wikilinkRe.exec(bodyStr)) !== null) {
      if (isInSkip(m.index)) continue
      wikilinks.push(m[1].split('|')[0].trim().normalize('NFC').toLowerCase())
    }

    const id = (format === 'paraverso' || format === 'paraverso-legacy') && frontmatter?.id
      ? String(frontmatter.id) : filename
    let titulo = (frontmatter?.titulo) ? String(frontmatter.titulo) : filename
    if (titulo === filename) {
      const h1 = bodyStr.match(/^#\s+(.+)/m)
      if (h1) titulo = h1[1].trim().normalize('NFC')
    }

    const subpasta = _subpasta(filePath, vaultPath)
    return {
      id,
      titulo: String(titulo),
      caderno: String(caderno),
      subpasta: subpasta || null,
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

export async function getAllNotesMetadata(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    const caderno = _topDir(filePath, vaultPath)
    try {
      const raw = await el().readFile(filePath)
      const { frontmatter, body, format } = parseMdFile(raw)
      const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

      if ((format === 'paraverso' || format === 'paraverso-legacy') && frontmatter?.id) {
        notas.push({
          id:        String(frontmatter.id),
          titulo:    String(frontmatter.titulo || filename),
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
          caderno:   String(caderno),
          tags:      [],
          editadaEm: 0,
          _filename: filename,
        })
      }
    } catch { /* skip */ }
  }
  return notas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
}

// ── Backlinks ────────────────────────────────────────────────────────────────

export async function getBacklinks(vaultPath, titulo) {
  if (!titulo) return []
  const allPaths = await _getAllMdPaths(vaultPath)
  const backlinks = []

  const tituloNorm = titulo.normalize('NFC')
  const termSimple = `[[${tituloNorm}]]`
  const termAlias  = `[[${tituloNorm}|`

  for (const filePath of allPaths) {
    try {
      const raw = await el().readFile(filePath)
      if (!raw.includes('[[')) continue
      const rawNorm = raw.normalize('NFC')
      if (!rawNorm.includes(termSimple) && !rawNorm.includes(termAlias)) continue

      const caderno  = _topDir(filePath, vaultPath)
      const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')
      const { frontmatter } = parseMdFile(raw)
      const notaTitulo = frontmatter?.titulo?.normalize('NFC') || filename

      backlinks.push({
        id:        frontmatter?.id || filename,
        titulo:    notaTitulo,
        caderno,
        _filename: filename,
      })
    } catch { /* skip corrupt */ }
  }
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
