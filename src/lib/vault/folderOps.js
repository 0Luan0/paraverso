/**
 * vault/folderOps.js — Folder/notebook CRUD, move, delete, rename propagation.
 */

import { el, RESERVED_DIRS, sanitizeName } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { _getAllMdPaths } from './pathUtils.js'

const CADERNOS_PADRAO = ['Inbox', 'Diário', 'Arquivo']

export async function getCadernosVault(vaultPath) {
  const entries = await el().readdir(vaultPath, { dirsOnly: true })
  const tplDir = (getTemplatesDir() || 'templates').toLowerCase()
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

export async function moverCadernoVault(vaultPath, fromRelPath, toRelPath) {
  const from = (fromRelPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  const to   = (toRelPath   || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!from || !to) throw new Error('Paths inválidos')
  if (from === to) return { from, to, noop: true }

  const fromTop = from.split(/[/\\]/)[0]
  const toTop   = to.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(fromTop)) throw new Error(`Pasta reservada não pode ser movida: ${fromTop}`)
  if (RESERVED_DIRS.has(toTop))   throw new Error(`Destino é pasta reservada: ${toTop}`)

  const tplDir = (getTemplatesDir() || 'templates').toLowerCase()
  if (fromTop.toLowerCase() === tplDir) {
    throw new Error('Pasta de templates não pode ser movida enquanto estiver configurada como tal')
  }

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

  await el().rename(fromAbs, toAbs)
  return { from, to, noop: false }
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

export async function deletarCadernoVault(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) throw new Error('Path vazio')

  const topSeg = rel.split(/[/\\]/)[0]
  if (RESERVED_DIRS.has(topSeg)) {
    throw new Error(`Pasta reservada não pode ser deletada: ${topSeg}`)
  }
  const tplDir = (getTemplatesDir() || 'templates').toLowerCase()
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

export async function resolverPastaAbsVault(vaultPath, relPath) {
  const rel = (relPath || '').trim().replace(/^[/\\]+|[/\\]+$/g, '')
  if (!rel) return vaultPath
  return el().joinPath(vaultPath, ...rel.split(/[/\\]/))
}

export async function propagarRenameVault(vaultPath, tituloAntigo, tituloNovo) {
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
