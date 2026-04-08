/**
 * vault/noteIO.js — Note CRUD operations (save, move, read, delete).
 */

import { markdownParaTipTapJson, parseObsidianFrontmatter, tiptapJsonParaMarkdown } from '../markdownUtils.js'
import { el, sanitizeName, filenameToId } from './shared.js'
import { parseMdFile, serializeNoteYaml, yamlStr } from './yamlUtils.js'
import { resolveFilenameCollision, _getAllMdPaths } from './pathUtils.js'

// ── Save semaphore — serializes saves per note ID ────────────────────────────
const _savingNotes = new Map()

async function acquireSaveLock(notaId) {
  while (_savingNotes.has(notaId)) {
    await _savingNotes.get(notaId)
  }
  let resolve
  const promise = new Promise(r => { resolve = r })
  _savingNotes.set(notaId, promise)
  return resolve
}

function releaseSaveLock(notaId, resolve) {
  _savingNotes.delete(notaId)
  resolve()
}

function _safeMarkdownParaTipTapJson(md) {
  try {
    return markdownParaTipTapJson(md)
  } catch {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: md || '' }] }],
    }
  }
}

// ── Save ─────────────────────────────────────────────────────────────────────

export async function saveNote(vaultPath, nota) {
  const resolve = await acquireSaveLock(nota.id)
  try {
    const baseFilename = sanitizeName(nota.titulo || 'sem-titulo')

    // Build directory path from nota.folder (unified path) or legacy caderno+subpasta
    const folder = nota.folder ?? (
      nota.caderno && nota.subpasta ? `${nota.caderno}/${nota.subpasta}`
      : nota.caderno || ''
    )
    const folderParts = folder ? folder.split('/').filter(Boolean) : []
    const dirPath = folderParts.length > 0
      ? await el().joinPath(vaultPath, ...folderParts)
      : vaultPath

    const newFilename = await resolveFilenameCollision(dirPath, baseFilename, nota.id)
    const newPath     = await el().joinPath(dirPath, newFilename + '.md')

    if (nota._filename && nota._filename !== newFilename) {
      try {
        const oldPath = await el().joinPath(dirPath, nota._filename + '.md')
        const oldExists = await el().exists(oldPath)
        if (oldExists) {
          await el().rename(oldPath, newPath)
        }
      } catch {
        // Old file may not exist — harmless
      }
    }

    let markdownBody = ''
    if (nota.conteudo) {
      if (typeof nota.conteudo === 'object' && nota.conteudo.type === 'doc') {
        if (nota._rawMarkdown !== undefined && nota._rawMarkdown !== null) {
          markdownBody = nota._rawMarkdown
        } else {
          markdownBody = tiptapJsonParaMarkdown(nota.conteudo)
        }
      } else if (typeof nota.conteudo === 'string') {
        markdownBody = nota._rawMarkdown ?? nota.conteudo
      }
    } else if (nota._rawMarkdown) {
      markdownBody = nota._rawMarkdown
    }

    const { _filename, _obsidian, _rawMarkdown, ...notaLimpa } = nota
    const yaml = serializeNoteYaml(notaLimpa)
    await el().writeFile(newPath, yaml + markdownBody)

    nota._filename = newFilename
    return newPath
  } finally {
    releaseSaveLock(nota.id, resolve)
  }
}

// ── Move ─────────────────────────────────────────────────────────────────────

export async function moveNote(vaultPath, nota, newFolder) {
  // newFolder is a single relative path: "Projetos/Web" or "" (vault root)
  const targetFolder = (newFolder || '').replace(/^[/\\]+|[/\\]+$/g, '')

  // Reject path traversal attempts
  if (/\.\.[\\/]|[\\/]\.\.|^\.\.$/.test(targetFolder) || /^[/\\]/.test(targetFolder)) {
    throw new Error('Caminho de destino inválido')
  }

  // Derive current folder from nota.folder or legacy caderno+subpasta
  const currentFolder = nota.folder ?? (
    nota.caderno && nota.subpasta ? `${nota.caderno}/${nota.subpasta}`
    : nota.caderno || ''
  )

  // Skip if already at target
  if (currentFolder === targetFolder) return nota

  const filename = nota._filename || sanitizeName(nota.titulo || 'sem-titulo')

  // Build old path from current folder
  const oldParts = [vaultPath, ...currentFolder.split('/').filter(Boolean), filename + '.md']
  const oldPath = await el().joinPath(...oldParts)

  // Build new path from target folder
  const newDirParts = [vaultPath, ...targetFolder.split('/').filter(Boolean)]
  const newDir = await el().joinPath(...newDirParts)
  const newPath = await el().joinPath(newDir, filename + '.md')

  console.log('[moveNote]', currentFolder || '(root)', '→', targetFolder || '(root)')

  try {
    const existe = await el().exists(oldPath)
    if (!existe) {
      console.error('[moveNote] file not found:', oldPath)
      throw new Error(`Arquivo não encontrado: ${oldPath}`)
    }

    // Update caderno: in YAML to first segment of target folder (for backward compat)
    const newCaderno = targetFolder.split('/')[0] || ''
    const raw = await el().readFile(oldPath)
    let updated = raw.replace(/^caderno:.*$/m, `caderno: ${yamlStr(newCaderno)}`)
    if (updated === raw && !/^caderno:/m.test(raw)) {
      updated = raw.replace(/^(id:.*$)/m, `$1\ncaderno: ${yamlStr(newCaderno)}`)
    }
    // Remove legacy subpasta: field if present (location is now derived from path)
    if (/^subpasta:.*$/m.test(updated)) {
      updated = updated.replace(/^subpasta:.*\n?/m, '')
    }

    await el().writeFile(newPath, updated)

    const escritoOk = await el().exists(newPath)
    if (!escritoOk) {
      throw new Error(`Write falhou — arquivo não encontrado no destino: ${newPath}`)
    }

    // Delete old file — rollback new copy if delete fails
    try {
      await el().deleteFile(oldPath)
    } catch (delErr) {
      console.error('[moveNote] rollback: removing new copy after failed delete')
      try { await el().deleteFile(newPath) } catch { /* best effort */ }
      throw new Error(`Falha ao remover arquivo original: ${delErr?.message}`)
    }

    console.debug('[moveNote] moved:', oldPath, '→', newPath)
    return { ...nota, folder: targetFolder }
  } catch (err) {
    console.error('[moveNote] failed:', err)
    throw err
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function readNote(filePath, cadernoHint = '') {
  const raw = await el().readFile(filePath)
  const { frontmatter, body, format } = parseMdFile(raw)
  const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

  if (format === 'paraverso' && frontmatter?.id) {
    return {
      ...frontmatter,
      caderno: cadernoHint || frontmatter.caderno || '',
      conteudo: body ? _safeMarkdownParaTipTapJson(body) : null,
      _rawMarkdown: body || '',
      _filename: filename,
    }
  }

  if (format === 'paraverso-legacy' && frontmatter?.id) {
    return {
      ...frontmatter,
      caderno: cadernoHint || frontmatter.caderno || '',
      _filename: filename,
    }
  }

  let titulo = filename
  let tags = []
  let markdownBody = body

  if (format === 'obsidian') {
    try {
      const { meta, body: bodyOnly } = parseObsidianFrontmatter(body)
      titulo = meta.title || meta.titulo || filename
      tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : []
      markdownBody = bodyOnly
    } catch {
      markdownBody = body
    }
  }

  if (titulo === filename) {
    const h1 = markdownBody.match(/^# (.+)/m)
    if (h1) titulo = h1[1].trim().normalize('NFC')
  }

  return {
    id: filename,
    titulo,
    caderno: cadernoHint,
    tags,
    conteudo: _safeMarkdownParaTipTapJson(markdownBody),
    _rawMarkdown: markdownBody,
    _obsidian: true,
    _filename: filename,
    criadaEm: Date.now(),
    editadaEm: Date.now(),
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteNote(vaultPath, _caderno, id) {
  let lastErr = null
  try {
    const allPaths = await _getAllMdPaths(vaultPath)
    for (const filePath of allPaths) {
      try {
        const raw = await el().readFile(filePath)
        const { frontmatter } = parseMdFile(raw)
        const filename = filePath.split(/[/\\]/).pop()
        const fnId = filenameToId(filename)
        if (frontmatter?.id === id || fnId === id || frontmatter?.id === String(id) || fnId === String(id)) {
          await el().deleteFile(filePath)
          return true
        }
      } catch (err) { lastErr = err }
    }
  } catch (err) { lastErr = err }
  if (lastErr) console.warn('[deletarNotaVault] nota não encontrada ou erro:', id, lastErr?.message)
  return false
}
