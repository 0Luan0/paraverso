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

export async function salvarNotaVault(vaultPath, nota) {
  const resolve = await acquireSaveLock(nota.id)
  try {
    const baseFilename = sanitizeName(nota.titulo || 'sem-titulo')
    const cadernoDir   = nota.caderno ? sanitizeName(nota.caderno) : ''
    const subpastaDir  = nota.subpasta ? sanitizeName(nota.subpasta) : null
    let dirPath
    if (cadernoDir && subpastaDir) {
      dirPath = await el().joinPath(vaultPath, cadernoDir, subpastaDir)
    } else if (cadernoDir) {
      dirPath = await el().joinPath(vaultPath, cadernoDir)
    } else {
      dirPath = vaultPath
    }

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

export async function moverNotaVault(vaultPath, nota, novoCaderno) {
  console.log('[moverNotaVault] chamado:', { vaultPath, id: nota?.id, titulo: nota?.titulo, _filename: nota?._filename, caderno: nota?.caderno, subpasta: nota?.subpasta, novoCaderno })
  const cadernoAtual = sanitizeName(nota.caderno || '')
  const cadernoNovo  = sanitizeName(novoCaderno || '')
  if (cadernoAtual === cadernoNovo) return nota

  const filename = nota._filename || sanitizeName(nota.titulo || 'sem-titulo')

  const oldPath = nota.subpasta
    ? await el().joinPath(vaultPath, cadernoAtual, nota.subpasta, filename + '.md')
    : await el().joinPath(vaultPath, cadernoAtual, filename + '.md')

  const newDir  = await el().joinPath(vaultPath, cadernoNovo)
  const newPath = await el().joinPath(newDir, filename + '.md')

  try {
    const existe = await el().exists(oldPath)
    if (!existe) {
      console.error('[moverNotaVault] arquivo não encontrado:', oldPath)
      throw new Error(`Arquivo não encontrado: ${oldPath}`)
    }

    const raw = await el().readFile(oldPath)
    const updated = raw.replace(/^caderno:.*$/m, `caderno: ${yamlStr(novoCaderno)}`)

    await el().writeFile(newPath, updated)

    const escritoOk = await el().exists(newPath)
    if (!escritoOk) {
      throw new Error(`Write falhou — arquivo não encontrado no destino: ${newPath}`)
    }

    await el().deleteFile(oldPath)

    console.debug('[moverNotaVault] movido:', oldPath, '→', newPath)
    return { ...nota, caderno: novoCaderno, subpasta: undefined }
  } catch (err) {
    console.error('[moverNotaVault] erro ao mover nota:', err)
    throw err
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function lerNotaVault(filePath, cadernoHint = '') {
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

export async function deletarNotaVault(vaultPath, _caderno, id) {
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
