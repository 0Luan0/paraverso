/**
 * vaultFs.js — Vault file system operations
 *
 * Notes live at:        {vault}/{caderno}/{titulo-sanitizado}.md
 *   (human-readable filenames, like Obsidian)
 * Monthly data lives:   {vault}/meses/YYYY-MM.md
 * Templates live at:    {vault}/templates/*.md   (plain markdown, human-writable)
 *
 * ── Note file format (Paraverso native YAML) ──────────────────────────────────
 *
 *   ---
 *   id: uuid
 *   titulo: Meu título aqui
 *   caderno: Pensamentos
 *   tags: ["tag1", "tag2"]
 *   criadaEm: 1234567890
 *   editadaEm: 1234567890
 *   ---
 *
 *   Corpo da nota em **markdown** normal.
 *
 * ── Obsidian compatibility ────────────────────────────────────────────────────
 * Files with YAML frontmatter that lack an `id:` field are treated as Obsidian
 * notes. On first save from Paraverso they convert to native format in-place.
 *
 * ── Rename handling ───────────────────────────────────────────────────────────
 * Each loaded note carries `_filename` (stem without .md). On save, if the
 * title-derived filename differs from `_filename`, the old file is deleted.
 */

import { markdownParaTipTapJson, parseObsidianFrontmatter, tiptapJsonParaMarkdown } from './markdownUtils'
import { mesId, criarMesVazio } from './mesUtils'

const el = () => window.electron

// Reserved folder names — excluded from cadernos list
// 'templates' foi removido: a pasta de templates agora aparece como caderno normal.
// O nome da pasta de templates é configurável e lido de configuredTemplatesDir.
const RESERVED_DIRS = new Set(['meses'])

// Pasta de templates configurável (padrão: 'templates'). Atualizada pelo ConfigTab.
let configuredTemplatesDir = 'templates'
export function setTemplatesDir(nome) { configuredTemplatesDir = nome || 'templates' }

// ── Save semaphore — serializa saves por nota ID ────────────────────────────
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

// ── Path helpers ──────────────────────────────────────────────────────────────

export async function joinPath(...parts) {
  return el().joinPath(...parts)
}

function sanitizeName(name) {
  return (name || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
}

/**
 * Verifica se filename já existe para outra nota (ID diferente).
 * Se existir, adiciona sufixo numérico: "nome 2", "nome 3", etc.
 */
async function resolveFilenameCollision(dirPath, baseFilename, notaId) {
  let candidate = baseFilename
  let counter = 2
  while (true) {
    const fullPath = await el().joinPath(dirPath, candidate + '.md')
    const exists = await el().exists(fullPath)
    if (!exists) return candidate
    // Arquivo existe — verificar se é a mesma nota (mesmo ID)
    try {
      const raw = await el().readFile(fullPath)
      const idMatch = raw.match(/^id:\s*(.+)$/m)
      if (idMatch && idMatch[1].trim() === notaId) return candidate // mesma nota, ok
    } catch { /* se não conseguir ler, assume conflito */ }
    candidate = `${baseFilename} ${counter++}`
    if (counter > 100) throw new Error(`Colisão de filename: não foi possível resolver para "${baseFilename}"`)
  }
}

function filenameToId(filename) {
  return filename.replace(/\.md$/i, '')
}

// ── Simple YAML parser (handles the subset we produce) ───────────────────────

function parseSimpleYaml(yamlBlock) {
  const result = {}
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    if (!key) continue

    // Array: ["item1", "item2"] or []
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim()
      if (!inner) {
        result[key] = []
      } else {
        result[key] = inner.split(',').map(s => {
          s = s.trim()
          if ((s.startsWith('"') && s.endsWith('"')) ||
              (s.startsWith("'") && s.endsWith("'"))) {
            try { return JSON.parse(s) } catch { return s.slice(1, -1) }
          }
          return s
        }).filter(Boolean)
      }
      continue
    }

    // JSON-quoted string: "text with spaces"
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      try { result[key] = JSON.parse(rawVal); continue } catch {}
    }

    // Single-quoted string
    if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
      result[key] = rawVal.slice(1, -1)
      continue
    }

    // Integer
    if (/^\d+$/.test(rawVal)) {
      result[key] = parseInt(rawVal, 10)
      continue
    }

    if (rawVal === 'true')  { result[key] = true;  continue }
    if (rawVal === 'false') { result[key] = false; continue }
    if (rawVal === 'null' || rawVal === '~' || rawVal === '') {
      result[key] = null; continue
    }

    result[key] = rawVal
  }
  return result
}

// ── File format: parse ────────────────────────────────────────────────────────

function parseMdFile(raw) {
  // ── Legacy Paraverso format: ---json frontmatter with TipTap JSON ──
  if (raw.startsWith('---json\n')) {
    const jsonStart = '---json\n'.length
    const jsonEnd = raw.indexOf('\n---', jsonStart)
    if (jsonEnd !== -1) {
      try {
        const frontmatter = JSON.parse(raw.slice(jsonStart, jsonEnd))
        const body = raw.slice(jsonEnd + '\n---'.length).replace(/^\n/, '')
        return { frontmatter, body, format: 'paraverso-legacy' }
      } catch { /* fall through */ }
    }
  }

  // ── YAML frontmatter (--- ... ---) ──
  if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
    const searchFrom = raw.startsWith('---\r\n') ? 5 : 4
    const endIdx = raw.indexOf('\n---\n', searchFrom)
    const endIdxEOF = raw.indexOf('\n---', searchFrom) // end-of-file variant

    let yamlContent, body
    if (endIdx !== -1) {
      yamlContent = raw.slice(searchFrom, endIdx)
      body = raw.slice(endIdx + 5) // skip \n---\n
    } else if (endIdxEOF !== -1 && endIdxEOF === raw.length - '\n---'.length) {
      yamlContent = raw.slice(searchFrom, endIdxEOF)
      body = ''
    } else {
      // No closing --- → treat as Obsidian plain markdown
      return { frontmatter: null, body: raw, format: 'obsidian' }
    }

    const parsed = parseSimpleYaml(yamlContent)
    if (parsed.id) {
      // Has id field → Paraverso native YAML format
      return { frontmatter: parsed, body: body.replace(/^\n/, ''), format: 'paraverso' }
    }

    // No id → Obsidian / external YAML (return raw so parseObsidianFrontmatter works)
    return { frontmatter: null, body: raw, format: 'obsidian' }
  }

  // Plain markdown
  return { frontmatter: null, body: raw, format: 'plain' }
}

// ── File format: serialize ────────────────────────────────────────────────────

// Quote a value for YAML if it contains special characters
function yamlStr(s) {
  if (s === null || s === undefined) return '""'
  const str = String(s)
  if (str === '') return '""'
  // Characters that require quoting in YAML
  if (/[:#{}\[\],&*?|<>=!%@`\\"]/.test(str) ||
      str.startsWith(' ') || str.endsWith(' ') ||
      str.includes('\n')) {
    return JSON.stringify(str) // produces proper JSON-quoted string
  }
  return str
}

function serializeNoteYaml(nota) {
  const tags = Array.isArray(nota.tags) && nota.tags.length > 0
    ? '[' + nota.tags.map(t => JSON.stringify(t)).join(', ') + ']'
    : '[]'
  return [
    '---',
    `id: ${nota.id}`,
    `titulo: ${yamlStr(nota.titulo || '')}`,
    `caderno: ${yamlStr(nota.caderno || '')}`,
    `tags: ${tags}`,
    `criadaEm: ${nota.criadaEm || Date.now()}`,
    `editadaEm: ${nota.editadaEm || Date.now()}`,
    '---',
    '',
  ].join('\n')
}

// Used for monthly data (keeps ---json format)
function serializeMdFile(frontmatter, body = '') {
  return `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}`
}

// ── Notes ─────────────────────────────────────────────────────────────────────

/**
 * Save a note to vault.
 * - Uses sanitized title as filename (Obsidian-style).
 * - Converts TipTap JSON body to Markdown before writing.
 * - If _filename differs from new title-derived filename, deletes the old file.
 * - After saving, updates nota._filename for next-save rename tracking.
 */
export async function salvarNotaVault(vaultPath, nota) {
  const resolve = await acquireSaveLock(nota.id)
  try {
    const baseFilename = sanitizeName(nota.titulo || 'sem-titulo')
    const cadernoDir   = sanitizeName(nota.caderno || 'Pensamentos')
    const dirPath      = await el().joinPath(vaultPath, cadernoDir)

    // ── Resolve colisão de filename (outra nota com mesmo nome) ──
    const newFilename = await resolveFilenameCollision(dirPath, baseFilename, nota.id)
    const newPath     = await el().joinPath(dirPath, newFilename + '.md')

    // ── Rename: se título mudou, usa rename atômico do OS ──
    if (nota._filename && nota._filename !== newFilename) {
      try {
        const oldPath = await el().joinPath(dirPath, nota._filename + '.md')
        const oldExists = await el().exists(oldPath)
        if (oldExists) {
          await el().rename(oldPath, newPath)
        }
      } catch {
        // Old file may not exist — harmless, write abaixo cria o novo
      }
    }

    // ── Convert content to Markdown ──
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

    // ── Strip private fields before writing ──
    const { _filename, _obsidian, _rawMarkdown, ...notaLimpa } = nota
    const yaml = serializeNoteYaml(notaLimpa)
    await el().writeFile(newPath, yaml + markdownBody)

    // Mutate nota._filename so next save knows the current filename
    nota._filename = newFilename
    return newPath
  } finally {
    releaseSaveLock(nota.id, resolve)
  }
}

/**
 * Move a note from one caderno to another.
 * Reads the file, updates caderno in frontmatter, writes to new location, deletes old.
 */
export async function moverNotaVault(vaultPath, nota, novoCaderno) {
  console.log('[moverNotaVault] chamado:', { vaultPath, id: nota?.id, titulo: nota?.titulo, _filename: nota?._filename, caderno: nota?.caderno, subpasta: nota?.subpasta, novoCaderno })
  const cadernoAtual = sanitizeName(nota.caderno || '')
  const cadernoNovo  = sanitizeName(novoCaderno || '')
  if (cadernoAtual === cadernoNovo) return nota

  const filename = nota._filename || sanitizeName(nota.titulo || 'sem-titulo')

  // subpasta é opcional — arquivo pode estar em caderno/subpasta/filename.md
  const oldPath = nota.subpasta
    ? await el().joinPath(vaultPath, cadernoAtual, nota.subpasta, filename + '.md')
    : await el().joinPath(vaultPath, cadernoAtual, filename + '.md')

  const newDir  = await el().joinPath(vaultPath, cadernoNovo)
  const newPath = await el().joinPath(newDir, filename + '.md')

  try {
    // Verifica se o arquivo origem existe
    const existe = await el().exists(oldPath)
    if (!existe) {
      console.error('[moverNotaVault] arquivo não encontrado:', oldPath)
      throw new Error(`Arquivo não encontrado: ${oldPath}`)
    }

    // Lê conteúdo atual
    const raw = await el().readFile(oldPath)

    // Atualiza caderno no frontmatter
    const updated = raw.replace(/^caderno:.*$/m, `caderno: ${yamlStr(novoCaderno)}`)

    // Escreve no novo local (writeFile já faz mkdir do pai)
    await el().writeFile(newPath, updated)

    // Confirma que o write funcionou antes de deletar o original
    const escritoOk = await el().exists(newPath)
    if (!escritoOk) {
      throw new Error(`Write falhou — arquivo não encontrado no destino: ${newPath}`)
    }

    // Deleta o arquivo antigo só após confirmação
    await el().deleteFile(oldPath)

    console.debug('[moverNotaVault] movido:', oldPath, '→', newPath)
    return { ...nota, caderno: novoCaderno, subpasta: undefined }
  } catch (err) {
    console.error('[moverNotaVault] erro ao mover nota:', err)
    throw err
  }
}

/**
 * Reads a note from a .md file.
 * Handles:
 *   1. Paraverso native YAML (id: in frontmatter) → returns stored metadata + markdown body
 *   2. Legacy Paraverso (---json frontmatter)      → returns stored metadata + TipTap JSON content
 *   3. Obsidian YAML frontmatter                   → auto-converts, marks _obsidian: true
 *   4. Plain markdown                              → treated like Obsidian
 */
function _safeMarkdownParaTipTapJson(md) {
  try {
    return markdownParaTipTapJson(md)
  } catch {
    // If the converter crashes, return a safe plain-text fallback
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: md || '' }] }],
    }
  }
}

export async function lerNotaVault(filePath, cadernoHint = '') {
  const raw = await el().readFile(filePath)
  const { frontmatter, body, format } = parseMdFile(raw)
  // .normalize('NFC') corrige filenames em NFD (padrão macOS APFS/HFS+):
  // sem isso, comparações com texto do editor (NFC) falham para acentos.
  const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

  // ── Paraverso native YAML ──
  if (format === 'paraverso' && frontmatter?.id) {
    return {
      ...frontmatter,
      // cadernoHint (pasta real no disco) tem prioridade sobre frontmatter.caderno
      // para evitar que notas sejam salvas na pasta errada
      caderno: cadernoHint || frontmatter.caderno || '',
      conteudo: body ? _safeMarkdownParaTipTapJson(body) : null,
      _rawMarkdown: body || '',
      _filename: filename,
    }
  }

  // ── Legacy Paraverso (---json) ──
  if (format === 'paraverso-legacy' && frontmatter?.id) {
    return {
      ...frontmatter,
      caderno: cadernoHint || frontmatter.caderno || '',
      // conteudo is already TipTap JSON stored in frontmatter
      _filename: filename,
    }
  }

  // ── Obsidian / plain markdown ──
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

  // Extract title from H1 if no explicit title
  // .normalize('NFC') garante consistência com filenames (macOS APFS usa NFD)
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

export async function deletarNotaVault(vaultPath, caderno, id) {
  // Varre todas as notas do caderno (incluindo subpastas) para encontrar pelo id
  try {
    const allPaths = await _getAllMdPaths(vaultPath)
    for (const filePath of allPaths) {
      if (_topDir(filePath, vaultPath) !== caderno.normalize('NFC')) continue
      try {
        const raw = await el().readFile(filePath)
        const { frontmatter } = parseMdFile(raw)
        const filename = filePath.split(/[/\\]/).pop()
        if (frontmatter?.id === id || filenameToId(filename) === id) {
          return el().deleteFile(filePath)
        }
      } catch {}
    }
  } catch {}
}

/**
 * Decompõe um caminho absoluto de arquivo em partes relativas ao vault.
 * Retorna array [caderno, ...subpastas, filename] ou [] se o arquivo não
 * estiver dentro do vault.
 *
 * Robusto a:
 *  - NFC/NFD (macOS APFS — readdir retorna NFD, dialog retorna NFC)
 *  - Trailing slashes no vaultPath
 *  - Case differences (APFS é case-insensitive)
 *  - Separadores mistos (\ vs /)
 */
function _relParts(filePath, vaultPath) {
  // Normaliza separadores e NFC
  const fp = filePath.normalize('NFC').replace(/\\/g, '/')
  const vp = vaultPath.normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '')

  const fpParts = fp.split('/').filter(Boolean)
  const vpParts = vp.split('/').filter(Boolean)

  if (fpParts.length <= vpParts.length) return []

  // Compara componente a componente (case-insensitive para macOS APFS)
  for (let i = 0; i < vpParts.length; i++) {
    if (fpParts[i].toLowerCase() !== vpParts[i].toLowerCase()) {
      console.debug('[Vault] _relParts mismatch:', fpParts[i], '!==', vpParts[i])
      return []
    }
  }

  const rel = fpParts.slice(vpParts.length) // [caderno, ...subpastas, filename]
  return rel
}

/**
 * Extrai o caminho relativo das subpastas entre o caderno e o arquivo.
 * Ex: '/vault/Refs/Vídeos/note.md' → 'Vídeos'
 * Ex: '/vault/Refs/note.md' → null (está direto no caderno)
 */
function _subpasta(filePath, vaultPath) {
  const parts = _relParts(filePath, vaultPath)
  // parts[0]=caderno, parts[-1]=arquivo, parts[1..-2]=subpastas
  if (parts.length >= 3) return parts.slice(1, -1).join('/')
  return null
}

/**
 * Extrai o nome do caderno (diretório de topo) de um caminho absoluto de arquivo.
 * Ex: '/vault/02 📖 - Referências/Vídeos/note.md' → '02 📖 - Referências'
 *
 * Usa _relParts que é robusto a NFC/NFD, trailing slashes e case differences.
 */
function _topDir(filePath, vaultPath) {
  const parts = _relParts(filePath, vaultPath)
  return parts[0] || ''
}

/**
 * Fallback: varre um nível de subpastas via readdir sequencial.
 * Usado quando readdirRecursive não está disponível (Electron não reiniciado).
 */
async function _getAllMdPathsFallback(vaultPath) {
  const topDirs = (await el().readdir(vaultPath, { dirsOnly: true })) || []
  const paths = []

  for (const dir of topDirs) {
    if (RESERVED_DIRS.has(dir)) continue
    const dirPath = await el().joinPath(vaultPath, dir)

    // Arquivos no topo do caderno
    const files = (await el().readdir(dirPath)) || []
    for (const f of files) {
      if (f.endsWith('.md')) paths.push(await el().joinPath(dirPath, f))
    }

    // Um nível de subpastas (cobre Referências/Vídeos, etc.)
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
 * Lista todos os arquivos .md do vault de forma recursiva, em uma única
 * chamada IPC (fs.promises.readdir recursive — Node 18.17+ / Electron 28+).
 *
 * Se readdirRecursive não estiver disponível (Electron não reiniciado),
 * cai no fallback que varre 1 nível de subpastas.
 *
 * Retorna array de caminhos absolutos, excluindo pastas reservadas.
 */
async function _getAllMdPaths(vaultPath) {
  let allPaths
  try {
    allPaths = await el().readdirRecursive(vaultPath)
    if (!Array.isArray(allPaths)) throw new Error('readdirRecursive retornou valor inválido')
  } catch {
    // IPC não registrado ainda (Electron não reiniciado) — usa fallback sequencial
    console.warn('[Vault] readdirRecursive indisponível, usando fallback. Reinicie o app para varredura completa.')
    return _getAllMdPathsFallback(vaultPath)
  }

  return allPaths.filter(p => {
    const topDir = _topDir(p, vaultPath)
    return topDir && !RESERVED_DIRS.has(topDir)
  })
}

export async function getNotasPorCadernoVault(vaultPath, caderno) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    if (_topDir(filePath, vaultPath) !== caderno.normalize('NFC')) continue
    try {
      const nota = await lerNotaVault(filePath, caderno)
      if (nota?.id) notas.push({ ...nota, subpasta: _subpasta(filePath, vaultPath) })
    } catch { /* skip corrupt */ }
  }
  return notas.sort((a, b) => (b.editadaEm || 0) - (a.editadaEm || 0))
}

export async function getTodasNotasVault(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const notas = []

  for (const filePath of allPaths) {
    const caderno = _topDir(filePath, vaultPath)
    try {
      const nota = await lerNotaVault(filePath, caderno)
      if (nota?.id) notas.push(nota)
    } catch { /* skip corrupt */ }
  }
  return notas
}

/**
 * Versão leve: retorna apenas metadados (id, titulo, caderno, tags, editadaEm)
 * sem converter o corpo markdown para TipTap JSON.
 * Usada pelo QuickSwitcher para não travar com centenas de notas.
 */
/**
 * Versão otimizada para o Graph View: retorna metadados + wikilinks extraídos.
 * Usa Promise.all para leitura paralela — muito mais rápido que sequencial.
 */
export async function getNotasParaGrafoVault(vaultPath) {
  const allPaths = await _getAllMdPaths(vaultPath)
  const wikilinkRe = /\[\[([^\]]+)\]\]/g

  const settled = await Promise.allSettled(allPaths.map(async (filePath) => {
    const caderno = _topDir(filePath, vaultPath)
    const raw = await el().readFile(filePath)
    const { frontmatter, body, format } = parseMdFile(raw)
    const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

    // Extrai wikilinks do body
    const wikilinks = []
    wikilinkRe.lastIndex = 0
    const bodyStr = body || ''
    let m
    while ((m = wikilinkRe.exec(bodyStr)) !== null) {
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

  // Log arquivos com erro sem crashar o grafo inteiro
  for (const r of settled) {
    if (r.status === 'rejected') console.warn('[getNotasParaGrafoVault] arquivo ignorado:', r.reason?.message)
  }

  return settled.filter(r => r.status === 'fulfilled').map(r => r.value)
}

export async function getTodasNotasMetadataVault(vaultPath) {
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
          // Usa sempre a pasta real no disco (caderno), não frontmatter.caderno
          caderno:   String(caderno),
          tags:      Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
          editadaEm: Number(frontmatter.editadaEm) || 0,
          _filename: filename,
        })
      } else {
        // Obsidian / plain — usa nome do arquivo e H1 se existir
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

// ── Templates ─────────────────────────────────────────────────────────────────

export async function getTemplatesVault(vaultPath) {
  const templatesDir = await el().joinPath(vaultPath, configuredTemplatesDir)
  const files = await el().readdir(templatesDir).catch(() => [])
  const mdFiles = (files || []).filter(f => f.endsWith('.md'))
  return mdFiles.map(f => ({ filename: f, titulo: filenameToId(f) }))
}

export async function lerTemplateVault(vaultPath, filename) {
  const filePath = await el().joinPath(vaultPath, configuredTemplatesDir, filename)
  const raw = await el().readFile(filePath)
  const { body } = parseMdFile(raw)
  return (body || raw).trimStart()
}

// ── Cadernos (derived from folder names) ─────────────────────────────────────

const CADERNOS_PADRAO = ['Pensamentos', 'Leituras', 'Projetos']

export async function getCadernosVault(vaultPath) {
  const entries = await el().readdir(vaultPath, { dirsOnly: true })
  const tplDir = (configuredTemplatesDir || 'templates').toLowerCase()
  const existingDirs = (entries || []).filter(e =>
    !RESERVED_DIRS.has(e) && e.toLowerCase() !== tplDir
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

export async function criarCadernoVault(vaultPath, nome) {
  const dirPath = await el().joinPath(vaultPath, sanitizeName(nome))
  await el().mkdir(dirPath)
  return { id: nome.toLowerCase(), nome, ordem: 99 }
}

// ── Monthly data ──────────────────────────────────────────────────────────────

// mesId e criarMesVazio importados de ./mesUtils

export async function getMesPath(vaultPath, ano, mes) {
  return el().joinPath(vaultPath, 'meses', `${mesId(ano, mes)}.md`)
}

export async function getMesVault(vaultPath, ano, mes) {
  const filePath = await getMesPath(vaultPath, ano, mes)
  const exists = await el().exists(filePath)

  if (!exists) {
    const novo = criarMesVazio(ano, mes)
    await salvarMesVault(vaultPath, novo)
    return novo
  }

  const raw = await el().readFile(filePath)
  const { frontmatter, body } = parseMdFile(raw)
  if (frontmatter && frontmatter.resumo === undefined && body) {
    frontmatter.resumo = body
  }
  return frontmatter || {}
}

export async function salvarMesVault(vaultPath, mesObj) {
  const filePath = await getMesPath(vaultPath, mesObj.ano, mesObj.mes)
  const { resumo, ...frontmatter } = mesObj
  const content = serializeMdFile(frontmatter, resumo || '')
  await el().writeFile(filePath, content)
}

export async function getTodosMesesVault(vaultPath) {
  const mesesDir = await el().joinPath(vaultPath, 'meses')
  const files = await el().readdir(mesesDir)
  const mdFiles = (files || []).filter(f => f.endsWith('.md'))

  const meses = []
  for (const file of mdFiles) {
    const filePath = await el().joinPath(mesesDir, file)
    try {
      const raw = await el().readFile(filePath)
      const { frontmatter, body } = parseMdFile(raw)
      if (!frontmatter?.id) continue          // skip if no valid frontmatter
      if (frontmatter.resumo === undefined && body) frontmatter.resumo = body
      meses.push(frontmatter)
    } catch { /* skip arquivo corrompido */ }
  }
  return meses
}

// ── Backlinks ─────────────────────────────────────────────────────────────────

/**
 * Encontra todas as notas que mencionam [[titulo]] ou [[titulo|alias]].
 * Lê o raw content de cada arquivo buscando o padrão — O(n) mas chamado
 * apenas ao abrir uma nota, não em hot path.
 */
export async function getBacklinksVault(vaultPath, titulo) {
  if (!titulo) return []
  const allPaths = await _getAllMdPaths(vaultPath)
  const backlinks = []

  // Padrões a buscar: [[titulo]] e [[titulo| (forma de alias)
  const tituloNorm = titulo.normalize('NFC')
  const termSimple = `[[${tituloNorm}]]`
  const termAlias  = `[[${tituloNorm}|`

  for (const filePath of allPaths) {
    try {
      const raw = await el().readFile(filePath)
      if (!raw.includes('[[')) continue
      // Normaliza o raw para NFC antes de comparar (macOS pode armazenar NFD)
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
    } catch { /* ignora arquivo corrompido */ }
  }
  return backlinks
}

// ── Vault initialization ──────────────────────────────────────────────────────

const NOTA_BOAS_VINDAS_MD = `# Bem-vindo ao Paraverso 🌿

Este é o seu caderno digital. Aqui você encontra um resumo rápido de tudo que pode fazer.

---

## Formatação básica

- **Negrito**: \`**texto**\`
- *Itálico*: \`*texto*\`
- ~~Tachado~~: \`~~texto~~\`
- \`Código inline\`: \`\\\`código\\\`\`

## Títulos

Use \`#\` para H1, \`##\` para H2, \`###\` para H3, e assim por diante.

## Listas

- Item comum
- Outro item
  - Sub-item (Tab para indentar)

1. Lista numerada
2. Segundo item

## Tarefas

- [ ] Tarefa pendente
- [x] Tarefa concluída

## Links entre notas — Wikilinks

A funcionalidade mais poderosa do Paraverso.

- Escreva \`[[\` para abrir o autocomplete de notas existentes
- Clique em um [[link]] para navegar direto para a nota
- Se a nota não existir, ela será criada automaticamente
- Você pode editar o texto de um link colocando o cursor dentro dele

## Citações

> Esta é uma citação em bloco.
> Ideal para destacar ideias importantes.

## Código

\`\`\`javascript
// Bloco de código
function hello() {
  return "Paraverso"
}
\`\`\`

---

## Atalhos de teclado

| Ação | Atalho |
|---|---|
| Nova nota | \`⌘N\` |
| Abrir nota rápida | \`⌘O\` |
| Buscar no editor | \`⌘F\` |
| Inserir template | \`⌘T\` |
| Negrito | \`⌘B\` |
| Itálico | \`⌘I\` |

---

Explore os cadernos na barra lateral. Cada pasta é um caderno.
Use a aba **Mês** para o seu diário + hábitos. Boa escrita! ✍️
`

export async function initVault(vaultPath) {
  await el().mkdir(await el().joinPath(vaultPath, 'meses'))
  await el().mkdir(await el().joinPath(vaultPath, configuredTemplatesDir))
  const cadernos = await getCadernosVault(vaultPath) // creates default cadernos if empty

  // Cria nota de boas-vindas se o vault é novo (sem nenhum .md ainda)
  try {
    const allPaths = await _getAllMdPaths(vaultPath).catch(() => [])
    if (allPaths.length === 0 && cadernos.length > 0) {
      const primeiroCaderno = cadernos[0].nome
      const id = crypto.randomUUID()
      const now = Date.now()
      const yaml = [
        '---',
        `id: ${id}`,
        `titulo: "Bem-vindo ao Paraverso"`,
        `caderno: ${JSON.stringify(primeiroCaderno)}`,
        `tags: []`,
        `criadaEm: ${now}`,
        `editadaEm: ${now}`,
        '---',
        '',
      ].join('\n')
      const filename = 'Bem-vindo ao Paraverso'
      const filePath = await el().joinPath(vaultPath, primeiroCaderno, filename + '.md')
      await el().writeFile(filePath, yaml + NOTA_BOAS_VINDAS_MD)
    }
  } catch (err) {
    console.warn('[initVault] Falha ao criar nota de boas-vindas:', err?.message)
  }
}
