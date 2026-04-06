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

// Reserved folder names — excluded from cadernos list and general file search.
// '_machine' is shown via its own dedicated section in the sidebar (NotesSidebar → MÁQUINA).
const RESERVED_DIRS = new Set(['meses', '_machine'])

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
    // caderno vazio = nota direto na raiz do vault (sem organização)
    const cadernoDir   = nota.caderno ? sanitizeName(nota.caderno) : ''
    const subpastaDir  = nota.subpasta ? sanitizeName(nota.subpasta) : null
    let dirPath
    if (cadernoDir && subpastaDir) {
      dirPath = await el().joinPath(vaultPath, cadernoDir, subpastaDir)
    } else if (cadernoDir) {
      dirPath = await el().joinPath(vaultPath, cadernoDir)
    } else {
      // Nota raiz — pasta destino é o próprio vaultPath
      dirPath = vaultPath
    }

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

export async function deletarNotaVault(vaultPath, _caderno, id) {
  // Scan em todo o vault (incluindo raiz e subpastas aninhadas), casa por id.
  // O parâmetro caderno é ignorado (mantido por compat) — antes filtrávamos por
  // caderno e isso falhava em notas em subpastas profundas após folder moves,
  // quando o cache de caderno ficava stale.
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
  // Se parts tem só 1 elemento, é só o filename — arquivo direto na raiz do vault,
  // sem diretório de topo. Retorna '' pra representar "nenhum caderno".
  if (parts.length < 2) return ''
  return parts[0] || ''
}

/**
 * Fallback: varre um nível de subpastas via readdir sequencial.
 * Usado quando readdirRecursive não está disponível (Electron não reiniciado).
 */
async function _getAllMdPathsFallback(vaultPath) {
  const topDirs = (await el().readdir(vaultPath, { dirsOnly: true })) || []
  const paths = []

  // Arquivos .md direto na raiz do vault (notas "soltas", sem caderno)
  try {
    const rootFiles = (await el().readdir(vaultPath)) || []
    for (const f of rootFiles) {
      if (f.endsWith('.md')) paths.push(await el().joinPath(vaultPath, f))
    }
  } catch { /* ignora se readdir da raiz falhar */ }

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
    // topDir === '' → arquivo direto na raiz do vault (permitido: notas soltas)
    // topDir em RESERVED_DIRS → filtrado (_machine, meses)
    return !RESERVED_DIRS.has(topDir)
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
  // `[^\]\n]+` impede que o match atravesse linhas. Também filtramos
  // matches dentro de inline code e code fences abaixo.
  const wikilinkRe = /\[\[([^\]\n]+)\]\]/g

  const settled = await Promise.allSettled(allPaths.map(async (filePath) => {
    const caderno = _topDir(filePath, vaultPath)
    const raw = await el().readFile(filePath)
    const { frontmatter, body, format } = parseMdFile(raw)
    const filename = filePath.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')

    // Detecta regiões a ignorar: inline code e code fences
    const bodyStr = body || ''
    const skipRanges = []
    const fenceRe = /```[\s\S]*?```/g
    let fm
    while ((fm = fenceRe.exec(bodyStr)) !== null) skipRanges.push([fm.index, fm.index + fm[0].length])
    const inlineRe = /`[^`\n]+`/g
    let im
    while ((im = inlineRe.exec(bodyStr)) !== null) skipRanges.push([im.index, im.index + im[0].length])
    const isInSkip = (pos) => skipRanges.some(([s, e]) => pos >= s && pos < e)

    // Extrai wikilinks do body — pulando regiões de código
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

const CADERNOS_PADRAO = ['Inbox', 'Diário', 'Arquivo']

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

// ── Folder moves & path helpers (Obsidian-like) ──────────────────────────────

/**
 * Quebra um path relativo de caderno em { caderno: topDir, subpasta: rest }.
 * Ex: "Arquivo/Codex/Leituras" → { caderno: "Arquivo", subpasta: "Codex/Leituras" }
 * Ex: "Codex" → { caderno: "Codex", subpasta: null }
 *
 * Usado por callers que leem configs de caderno (journalCaderno, defaultCaderno)
 * para suportar configs que, após folder moves, guardam paths nested.
 */
export function splitCadernoPath(relPath) {
  if (!relPath || typeof relPath !== 'string') return { caderno: '', subpasta: null }
  const norm = relPath.replace(/^[/\\]+|[/\\]+$/g, '')
  if (!norm) return { caderno: '', subpasta: null }
  const parts = norm.split(/[/\\]/)
  if (parts.length === 1) return { caderno: parts[0], subpasta: null }
  return { caderno: parts[0], subpasta: parts.slice(1).join('/') }
}

/**
 * Move (rename) uma pasta inteira no vault via fs.rename atômico.
 * Paths são relativos ao vault (ex: "Codex", "Arquivo/Codex").
 *
 * Guards:
 *  - Não mexe em RESERVED_DIRS (_machine, meses)
 *  - Não mexe na pasta de templates configurada
 *  - Aborta se o destino já existe (sem merge, sem auto-rename)
 *  - Aborta se o destino está dentro da origem (cycle)
 */
export async function moverCadernoVault(vaultPath, fromRelPath, toRelPath) {
  const from = (fromRelPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  const to   = (toRelPath   || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!from || !to) throw new Error('Paths inválidos')
  if (from === to) return { from, to, noop: true }

  const fromTop = from.split(/[/\\]/)[0]
  const toTop   = to.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(fromTop)) throw new Error(`Pasta reservada não pode ser movida: ${fromTop}`)
  if (RESERVED_DIRS.has(toTop))   throw new Error(`Destino é pasta reservada: ${toTop}`)

  const tplDir = (configuredTemplatesDir || 'templates').toLowerCase()
  if (fromTop.toLowerCase() === tplDir) {
    throw new Error('Pasta de templates não pode ser movida enquanto estiver configurada como tal')
  }

  // Cycle guard: não pode mover pra dentro de si mesma
  if (to === from || to.startsWith(from + '/') || to.startsWith(from + '\\')) {
    throw new Error('Não é possível mover uma pasta pra dentro dela mesma')
  }

  const fromAbs = await el().joinPath(vaultPath, ...from.split(/[/\\]/))
  const toAbs   = await el().joinPath(vaultPath, ...to.split(/[/\\]/))

  if (!(await el().exists(fromAbs))) {
    throw new Error(`Pasta origem não encontrada: ${from}`)
  }
  if (await el().exists(toAbs)) {
    throw new Error(`Já existe uma pasta em ${to}`)
  }

  // fs:rename em diretório — main.cjs já garante mkdir -p do pai
  await el().rename(fromAbs, toAbs)
  return { from, to, noop: false }
}

/**
 * Reescreve as configs de caderno (journalCaderno, defaultCaderno, templatesDir)
 * quando uma pasta é movida. Preserva sub-caminhos:
 *   journalCaderno="Codex"          + move Codex → Arquivo/Codex  → "Arquivo/Codex"
 *   journalCaderno="Codex/Sub"      + move Codex → Arquivo/Codex  → "Arquivo/Codex/Sub"
 *
 * Retorna array de { key, from, to } pra alimentar toasts.
 */
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

/**
 * Deleta uma pasta do vault recursivamente (incluindo todo o conteúdo).
 * Guards: RESERVED_DIRS e pasta de templates configurada.
 * Path é relativo ao vault (ex: "Codex" ou "Codex/Leituras").
 */
export async function deletarCadernoVault(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) throw new Error('Path vazio')

  const topSeg = rel.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(topSeg)) {
    throw new Error(`Pasta reservada não pode ser deletada: ${topSeg}`)
  }
  const tplDir = (configuredTemplatesDir || 'templates').toLowerCase()
  if (topSeg.toLowerCase() === tplDir) {
    throw new Error('Pasta de templates não pode ser deletada enquanto estiver configurada como tal')
  }

  const absPath = await el().joinPath(vaultPath, ...rel.split(/[/\\]/))
  if (!(await el().exists(absPath))) {
    throw new Error(`Pasta não encontrada: ${rel}`)
  }
  await el().rmrf(absPath)
  return true
}

/**
 * Cria uma subpasta dentro do vault.
 * parentRelPath='' → cria na raiz do vault (nova pasta top-level, igual criarCadernoVault)
 * parentRelPath='Codex' → cria em Codex/<nome>
 */
export async function criarSubpastaVault(vaultPath, parentRelPath, nome) {
  const nomeSane = sanitizeName(nome)
  if (!nomeSane || nomeSane === 'sem-titulo') throw new Error('Nome inválido')

  const parent = (parentRelPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  const parentTop = parent.split(/[/\\]/)[0]
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

/**
 * Retorna o caminho absoluto de uma pasta do vault, pra passar pro Finder.
 */
export async function resolverPastaAbsVault(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) return vaultPath
  return el().joinPath(vaultPath, ...rel.split(/[/\\]/))
}

/**
 * Propaga um rename de nota para todos os wikilinks `[[tituloAntigo]]` e
 * `[[tituloAntigo|alias]]` no vault, preservando aliases.
 *
 * Fast path: `raw.includes('[[old')` antes do regex full — pula notas sem match.
 *
 * Retorna array de caminhos atualizados (pra alimentar toast).
 */
export async function propagarRenameVault(vaultPath, tituloAntigo, tituloNovo) {
  if (!tituloAntigo || !tituloNovo) return []
  const oldNorm = String(tituloAntigo).normalize('NFC')
  const newNorm = String(tituloNovo).normalize('NFC')
  if (oldNorm === newNorm) return []

  // Escapa caracteres especiais de regex no título antigo
  const escaped = oldNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Casa [[Title]] e [[Title|alias]] — captura o alias se houver
  const re = new RegExp(`\\[\\[${escaped}(\\|[^\\]]*)?\\]\\]`, 'g')

  const allPaths = await _getAllMdPaths(vaultPath)
  const updated = []
  for (const filePath of allPaths) {
    try {
      const raw = await el().readFile(filePath)
      if (!raw || !raw.includes(`[[${oldNorm}`)) continue // fast path
      const next = raw.replace(re, (_m, alias) => `[[${newNorm}${alias || ''}]]`)
      if (next !== raw) {
        await el().writeFile(filePath, next)
        updated.push(filePath)
      }
    } catch (err) {
      console.warn('[propagarRenameVault] falha ao processar', filePath, err?.message)
    }
  }
  return updated
}

// ── Vault initialization ──────────────────────────────────────────────────────

// ── Onboarding: notas iniciais criadas num vault novo ───────────────────────

const ONBOARDING_NOTAS = [
  {
    filename: '1. Bem-vindo ao Paraverso',
    body: `# Bem-vindo ao Paraverso 🌿

Este é o seu segundo cérebro. Um lugar pra pensar, registrar, conectar ideias.

Se você nunca usou um app de PKM (*Personal Knowledge Management*) antes, não se preocupe. Os 3 princípios que importam são:

1. **Capture first, organize later** — escreva primeiro, organize depois. Jogue tudo na \`Inbox\` sem culpa.
2. **Link > folder** — conectar notas com \`[[wikilinks]]\` vale mais do que organizar em pastas.
3. **Review semanal** — reserve 10 minutos por semana pra revisitar sua Inbox e decidir o que virou ideia permanente.

É isso. Simples. Se duvidar, volte pra esses 3 princípios.

---

Suas próximas leituras (todas aqui na Inbox):

[[2. Como escrever]] — markdown básico e wikilinks
[[3. Atalhos]] — os atalhos de teclado mais úteis
[[4. Abas do app]] — o que cada aba faz
[[5. Princípios PKM]] — aprofundando os 3 princípios acima

Boa escrita. ✍️
`,
  },
  {
    filename: '2. Como escrever',
    body: `# Como escrever

O Paraverso usa **markdown** puro — a mesma sintaxe do Obsidian, GitHub, Notion.

## Formatação básica

- **Negrito** com \`**texto**\`
- *Itálico* com \`*texto*\`
- ~~Tachado~~ com \`~~texto~~\`
- \`Código inline\` com crases

## Títulos

Use \`#\` pra H1, \`##\` pra H2, e assim por diante até \`######\`.

## Listas

- Item
- Outro item
  - Sub-item (Tab pra indentar)

## Tarefas

- [ ] Tarefa pendente
- [x] Tarefa feita

## Wikilinks — o coração do app

Escreva \`[[\` e o autocomplete abre com suas notas. Confirme com Enter.

Se a nota não existe, o link fica pendente — quando você clicar nele, a nota é criada automaticamente no caderno ativo.

Wikilinks suportam alias: \`[[Título real|texto exibido]]\`.

## Tags

Escreva \`#nome-da-tag\` em qualquer lugar. Tags são buscáveis no \`⌘O\` e aparecem no grafo.

## Imagens e PDFs

\`Ctrl+V\` ou \`⌘V\` com uma imagem/PDF no clipboard — o arquivo vai pra pasta \`attachments/\` automaticamente e aparece inline na nota.

---

Próxima: [[3. Atalhos]]

Anterior: [[1. Bem-vindo ao Paraverso]]
`,
  },
  {
    filename: '3. Atalhos',
    body: `# Atalhos

## Navegação

| Atalho | Ação |
|---|---|
| \`⌘O\` | Abrir qualquer nota do vault (*Quick Switcher*) |
| \`⌘N\` | Nova nota (na pasta padrão) |
| \`⌘T\` | Inserir template |
| \`⌘F\` | Buscar dentro da nota atual |

## Edição

| Atalho | Ação |
|---|---|
| \`⌘B\` | Negrito |
| \`⌘I\` | Itálico |
| \`Tab\` | Indentar lista |
| \`⇧Tab\` | Desindentar |

## Na sidebar

- **Clique direito** em qualquer pasta → menu com Nova nota, Nova pasta, Renomear, Mover, Revelar no Finder, Apagar
- **Arrastar** uma pasta pra dentro de outra → ela vira subpasta. Todas as referências (journal, configs, grupos de cor do grafo) atualizam automaticamente
- **Arrastar** uma nota entre cadernos → move o arquivo

## Renomear notas

Mudar o título de uma nota renomeia o arquivo E atualiza todos os \`[[wikilinks]]\` que apontam pra ela no vault inteiro. Nada fica quebrado.

---

Próxima: [[4. Abas do app]]

Anterior: [[2. Como escrever]]
`,
  },
  {
    filename: '4. Abas do app',
    body: `# Abas do app

## 📅 Mês

Seu diário visual. Uma grade do mês com cada dia clicável. Também tem metas (por categoria) e registro de hábitos com cores. Use quando quiser registrar como foi o seu dia ou acompanhar rotina.

O botão de **nota diária** cria automaticamente uma nota no caderno \`Diário\` com o template \`Nota diária\`.

## 📝 Notas

Onde você tá agora. Sidebar com seus cadernos + editor + painel de backlinks (quem menciona a nota atual).

## 🕸️ Grafo

Visualização de todo o vault como uma rede. Cada nó é uma nota, cada linha é um \`[[wikilink]]\`. Nós são coloridos por caderno.

Dê zoom in pra ver os nomes das notas aparecerem. Clique num nó pra abrir a nota no editor.

No painel de configurações (⚙ no canto), você pode criar **grupos de cor** — regras tipo "todas as notas do caderno Projetos ficam laranja".

## ⚙️ Config

Onde você configura a pasta padrão de novas notas, a pasta das notas diárias, tema, textura do editor, e importa um vault do Obsidian.

---

Próxima: [[5. Princípios PKM]]

Anterior: [[3. Atalhos]]
`,
  },
  {
    filename: '5. Princípios PKM',
    body: `# Princípios de PKM

Esses 3 princípios vieram do *Building a Second Brain* (Tiago Forte) e do método *Zettelkasten* (Niklas Luhmann). São o mínimo que você precisa saber.

## 1. Capture first, organize later

A maior armadilha de quem começa num app assim é **travar decidindo onde guardar**. Esqueça.

Toda ideia, frase solta, trecho copiado de um livro, recado que você quer lembrar — vai pra \`Inbox\`. Sem hierarquia, sem categoria, sem tag. Só escreve.

Organizar é uma atividade **separada**, que você faz depois.

## 2. Link é mais importante que pasta

Pastas são úteis pra separar grandes contextos (Trabalho, Pessoal, Projetos). Mas a **conexão real** entre ideias acontece via \`[[wikilinks]]\`.

Uma nota sobre *produtividade* pode linkar uma sobre *sono*, que linka uma sobre *alimentação*, que linka uma sobre *disciplina*. Essa teia é o seu segundo cérebro — não as pastas.

Regra prática: se você tem dúvida entre criar uma pasta ou usar um wikilink, use wikilink.

## 3. Review semanal

Reserve **10 minutos por semana** pra:

1. Abrir a \`Inbox\`
2. Pra cada nota solta, decidir: isso é lixo, isso virou ideia permanente, isso vira projeto, ou isso fica na Inbox mais uma semana
3. Notas permanentes vão pra um caderno próprio (ou continuam na Inbox com wikilinks)
4. Lixo vai pra \`Arquivo\` (ou é apagado)

Sem review, a Inbox vira lixão. Com review, vira mina de ouro.

## MOC — Map of Content

Conforme você acumula notas, algumas viram "índices" — listas de \`[[]]\` sobre um tema. Isso é um **MOC** (Map of Content).

Ex: uma nota chamada \`MOC — Produtividade\` que só tem wikilinks pras notas mais importantes sobre o tema. Você escreve essa nota aos poucos, ela cresce com você.

MOCs são o jeito Obsidian de criar hierarquia sem pastas.

---

Pronto. Você sabe tudo que precisa saber pra começar. O resto você aprende escrevendo.

Anterior: [[4. Abas do app]]
`,
  },
]

// ── Templates iniciais ──────────────────────────────────────────────────────

const TEMPLATES_INICIAIS = [
  {
    filename: 'Nota diária.md',
    body: `# {{date}}

## Como me sinto

## O que fiz hoje

-

## O que aprendi

## Amanhã

- [ ]
`,
  },
  {
    filename: 'Nota de leitura.md',
    body: `# {{Title}}

**Autor:**
**Fonte:** (livro, artigo, vídeo, podcast)
**Data:** {{date}}

## Resumo em 1 frase

## Highlights

>

## Minhas ideias

## Conecta com

- [[]]
`,
  },
]

// ── _machine: instrução do Claude terminal ──────────────────────────────────

const MACHINE_CLAUDE_GUIDE = `# Como usar o Claude no terminal

O Paraverso funciona melhor com o **Claude Code** instalado. É uma IA que roda no seu terminal, dentro da pasta do vault — ela lê e escreve notas direto aqui.

## Instalar

Site oficial: https://claude.com/claude-code

Siga as instruções da página pra instalar na sua máquina.

## Usar

1. Abra o terminal
2. Navegue até a pasta do seu vault:
   \`\`\`
   cd "caminho/do/vault"
   \`\`\`
3. Rode:
   \`\`\`
   claude
   \`\`\`

Pronto. Agora você pode pedir coisas em linguagem natural:

- "Resume minhas últimas 5 notas diárias"
- "Cria uma nota sobre X linkando com Y e Z"
- "Organiza minha Inbox agrupando por tema"
- "Lê minha nota [[Produtividade]] e sugere 3 conexões"

O Claude vê a pasta \`_machine/\` (onde você tá agora) mas **também** vê todas as suas notas humanas. Ele escreve em \`_machine/\` por padrão pra não bagunçar seu vault — você pode mover depois se quiser.

---

## A skill mais importante: **contexto**

De todas as skills que você pode criar ou usar, a mais importante é a **skill de contexto**: ela faz o Claude **ler o seu vault inteiro, aprender sobre você, e escrever o que aprendeu** em \`_machine/contexts/contexto.md\`.

É isso que transforma o Claude de um assistente genérico em um parceiro que entende **você**: como você pensa, como você escreve, o que te interessa, quais projetos você tem em andamento.

Quanto mais você usa essa skill, mais rica fica a nota de contexto, e melhor ficam TODAS as outras respostas do Claude no vault — porque toda pergunta futura passa a ser respondida com esse contexto carregado.

**Como usar:**

1. Deixe o vault populado com algumas notas suas (mesmo que poucas)
2. No Claude terminal, digite \`/contexto\` (se a skill estiver instalada) ou peça em linguagem natural: *"Lê o meu vault inteiro e atualiza \`_machine/contexts/contexto.md\` com o que você aprendeu sobre mim"*
3. Claude vai ler tudo, identificar padrões (temas recorrentes, forma de escrever, interesses, projetos) e atualizar o arquivo de contexto
4. Das próximas vezes que você abrir o Claude no vault, ele começa já sabendo quem você é

Faça isso pelo menos uma vez por semana — o contexto evolui junto com você.

---

## Outras skills

O Claude tem o conceito de **skills**: instruções em markdown que viram atalhos reutilizáveis, ativados com \`/nome-da-skill\`. Elas ficam em \`~/.claude/skills/\`.

Exemplo em texto (ilustrativo — não está criada):

\`\`\`
~/.claude/skills/review-semanal/SKILL.md

---
name: review-semanal
description: Revisa a Inbox do vault e sugere organização por tema.
---

Leia todas as notas em Inbox/. Para cada uma:
1. Classifique como: lixo, ideia permanente, tarefa, ou continua inbox.
2. Sugira 1 wikilink pra uma nota existente do vault.
3. Se for ideia permanente, sugira o caderno destino.

Apresente como tabela e espere eu aprovar antes de mover algo.
\`\`\`

Com isso, basta digitar \`/review-semanal\` no Claude e ele roda essa rotina toda.

Você descobre as skills disponíveis digitando \`/\` no Claude. Pra criar as suas, é só um arquivo markdown na pasta certa — o Claude detecta automaticamente.

---

Essa é a introdução mínima. O resto você descobre usando.
`

// ── initVault ───────────────────────────────────────────────────────────────

/**
 * Helper: escreve uma nota no vault com frontmatter YAML completo.
 * Usado só pelo onboarding inicial.
 */
async function _writeOnboardingNote(vaultPath, caderno, filename, body) {
  const id = crypto.randomUUID()
  const now = Date.now()
  const yaml = [
    '---',
    `id: ${id}`,
    `titulo: ${JSON.stringify(filename)}`,
    `caderno: ${JSON.stringify(caderno)}`,
    `tags: []`,
    `criadaEm: ${now}`,
    `editadaEm: ${now}`,
    '---',
    '',
  ].join('\n')
  const filePath = await el().joinPath(vaultPath, caderno, filename + '.md')
  await el().writeFile(filePath, yaml + body)
}

export async function initVault(vaultPath) {
  // Pastas base
  await el().mkdir(await el().joinPath(vaultPath, 'meses'))
  await el().mkdir(await el().joinPath(vaultPath, configuredTemplatesDir))

  // Cria cadernos default (Inbox, Diário, Arquivo) se não existir nenhum
  const cadernos = await getCadernosVault(vaultPath)

  try {
    const allPaths = await _getAllMdPaths(vaultPath).catch(() => [])

    // Só popula onboarding se o vault tá completamente vazio
    if (allPaths.length === 0 && cadernos.length > 0) {
      // 1. Notas de onboarding em Inbox
      const inboxExists = cadernos.find(c => c.nome === 'Inbox')
      const cadernoAlvo = inboxExists ? 'Inbox' : cadernos[0].nome
      for (const nota of ONBOARDING_NOTAS) {
        await _writeOnboardingNote(vaultPath, cadernoAlvo, nota.filename, nota.body)
      }

      // 2. Templates iniciais
      for (const tpl of TEMPLATES_INICIAIS) {
        const tplPath = await el().joinPath(vaultPath, configuredTemplatesDir, tpl.filename)
        const exists = await el().exists(tplPath)
        if (!exists) await el().writeFile(tplPath, tpl.body)
      }

      // 3. _machine: só a instrução do Claude.
      // A estrutura base (contexts/contexto.md + README) é criada pelo
      // machine:init em App.jsx. Aqui só adicionamos o guia de uso.
      try {
        const machineDir = await el().joinPath(vaultPath, '_machine')
        await el().mkdir(machineDir)

        const claudeGuidePath = await el().joinPath(machineDir, 'Como usar Claude.md')
        if (!(await el().exists(claudeGuidePath))) {
          await el().writeFile(claudeGuidePath, MACHINE_CLAUDE_GUIDE)
        }
      } catch (err) {
        console.warn('[initVault] Falha ao popular _machine:', err?.message)
      }

      // 4. Configs defaults — só seta se o usuário ainda não tem
      try {
        const currentDefault = await el().getConfig?.('defaultCaderno')
        if (!currentDefault) await el().setConfig?.('defaultCaderno', 'Inbox')

        const currentJournal = await el().getConfig?.('journalCaderno')
        if (!currentJournal) await el().setConfig?.('journalCaderno', 'Diário')
      } catch (err) {
        console.warn('[initVault] Falha ao setar configs default:', err?.message)
      }
    }
  } catch (err) {
    console.warn('[initVault] Falha no onboarding:', err?.message)
  }
}
