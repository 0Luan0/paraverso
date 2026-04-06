/**
 * vault/monthIO.js — Monthly data CRUD (meses/YYYY-MM.md files).
 */

import { el } from './shared.js'
import { mesId, criarMesVazio } from '../mesUtils.js'
import { parseMdFile, serializeMdFile } from './yamlUtils.js'

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
      if (!frontmatter?.id) continue
      if (frontmatter.resumo === undefined && body) frontmatter.resumo = body
      meses.push(frontmatter)
    } catch { /* skip corrupt */ }
  }
  return meses
}
