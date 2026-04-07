/**
 * vault/metaFolderIO.js — Category folders and meta item notes.
 *
 * Categories are subfolders inside meses/:  meses/Leituras/
 * Meta items are notes inside those folders: meses/Leituras/Ler livro X.md
 * Categories are shared across months (not inside monthly subfolders).
 */

import { el, sanitizeName, filenameToId } from './shared.js'
import { serializeNoteYaml, parseMdFile } from './yamlUtils.js'

/**
 * Read all metas from category folders.
 * For each active category, lists notes in meses/{categoria}/ folder.
 * Returns the same metas[] shape as the old mesObj.metas.
 */
export async function readMetas(vaultPath, categorias) {
  const metas = []

  for (const categoria of categorias) {
    const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(categoria))
    let files = []
    try {
      files = (await el().readdir(dirPath)) || []
    } catch {
      // Folder doesn't exist — create it
      try { await el().mkdir(dirPath) } catch { /* race */ }
    }

    const mdFiles = files.filter(f => f.endsWith('.md'))
    const itens = []

    for (const file of mdFiles) {
      try {
        const filePath = await el().joinPath(dirPath, file)
        const raw = await el().readFile(filePath)
        const { frontmatter } = parseMdFile(raw)
        const filename = filenameToId(file)

        // feito state: check frontmatter or body checkbox
        let feito = false
        if (frontmatter?.feito !== undefined) {
          feito = frontmatter.feito === true || frontmatter.feito === 'true'
        }

        itens.push({
          id: frontmatter?.id || filename,
          texto: frontmatter?.titulo || filename,
          feito,
        })
      } catch { /* skip corrupt */ }
    }

    metas.push({
      id: sanitizeName(categoria), // use folder name as stable ID
      categoria,
      itens,
    })
  }

  return metas
}

/**
 * Create a category folder inside meses/.
 */
export async function createCategory(vaultPath, nome) {
  const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(nome))
  await el().mkdir(dirPath)
}

/**
 * Rename a category folder.
 */
export async function renameCategory(vaultPath, oldName, newName) {
  const oldPath = await el().joinPath(vaultPath, 'meses', sanitizeName(oldName))
  const newPath = await el().joinPath(vaultPath, 'meses', sanitizeName(newName))
  if (await el().exists(oldPath)) {
    await el().rename(oldPath, newPath)
  }
}

/**
 * Create a meta item note inside a category folder.
 * Returns the created note's ID.
 */
export async function createMetaItem(vaultPath, categoria, texto) {
  const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(categoria))
  try { await el().mkdir(dirPath) } catch { /* already exists */ }

  const id = crypto.randomUUID()
  const nota = {
    id,
    titulo: texto,
    caderno: 'meses',
    subpasta: sanitizeName(categoria),
    tags: [],
    feito: false,
    criadaEm: Date.now(),
    editadaEm: Date.now(),
  }

  const yaml = serializeNoteYaml(nota)
  const filename = sanitizeName(texto) + '.md'
  const filePath = await el().joinPath(dirPath, filename)
  await el().writeFile(filePath, yaml + '\n')

  return id
}

/**
 * Toggle the feito state of a meta item note.
 */
export async function toggleMetaItem(vaultPath, categoria, itemId, feito) {
  const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(categoria))
  const files = (await el().readdir(dirPath)) || []

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const filePath = await el().joinPath(dirPath, file)
    try {
      const raw = await el().readFile(filePath)
      const { frontmatter } = parseMdFile(raw)
      if (frontmatter?.id === itemId) {
        // Update feito field in frontmatter
        const updated = raw.replace(
          /^feito:.*$/m,
          `feito: ${feito ? 'true' : 'false'}`
        )
        await el().writeFile(filePath, updated)
        return
      }
    } catch { /* skip */ }
  }
}

/**
 * Delete a meta item note.
 */
export async function deleteMetaItem(vaultPath, categoria, itemId) {
  const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(categoria))
  const files = (await el().readdir(dirPath)) || []

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const filePath = await el().joinPath(dirPath, file)
    try {
      const raw = await el().readFile(filePath)
      const { frontmatter } = parseMdFile(raw)
      if (frontmatter?.id === itemId) {
        await el().deleteFile(filePath)
        return
      }
    } catch { /* skip */ }
  }
}

/**
 * Delete a category folder and all its contents.
 */
export async function deleteCategory(vaultPath, nome) {
  const dirPath = await el().joinPath(vaultPath, 'meses', sanitizeName(nome))
  if (await el().exists(dirPath)) {
    await el().rmrf(dirPath)
  }
}
