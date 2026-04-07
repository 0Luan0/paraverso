/**
 * vaultFs.js — Barrel file re-exporting all vault modules.
 *
 * Exports both new English names and old Portuguese aliases for
 * backward compatibility. Downstream code (db/index.js, components)
 * can migrate to new names at their own pace.
 *
 * Modules:
 *   vault/shared.js      — el(), RESERVED_DIRS, sanitizeName, setTemplatesDir
 *   vault/yamlUtils.js    — parseSimpleYaml, parseMdFile, serializeNoteYaml, yamlStr
 *   vault/pathUtils.js    — joinPath, splitCadernoPath, path helpers, file listing
 *   vault/noteIO.js       — saveNote, moveNote, readNote, deleteNote
 *   vault/noteQueries.js  — getNotesByNotebook, getAllNotes, backlinks, templates
 *   vault/folderOps.js    — getNotebooks, moveNotebook, propagateRename, etc.
 *   vault/monthIO.js      — getMonth, saveMonth, getAllMonths
 *   vault/initVault.js    — initVault (onboarding)
 */

// Shared
export { setTemplatesDir } from './vault/shared.js'

// Path utilities
export { joinPath, splitCadernoPath } from './vault/pathUtils.js'

// Note CRUD — new English names
export { saveNote, moveNote, readNote, deleteNote } from './vault/noteIO.js'
// Backward-compatible aliases
export { saveNote as salvarNotaVault } from './vault/noteIO.js'
export { moveNote as moverNotaVault } from './vault/noteIO.js'
export { readNote as lerNotaVault } from './vault/noteIO.js'
export { deleteNote as deletarNotaVault } from './vault/noteIO.js'

// Note queries + templates + backlinks — new English names
export {
  getNotesByNotebook,
  getAllNotes,
  getNotesForGraph,
  getAllNotesMetadata,
  getBacklinks,
  getTemplates,
  readTemplate,
} from './vault/noteQueries.js'
// Backward-compatible aliases
export { getNotesByNotebook as getNotasPorCadernoVault } from './vault/noteQueries.js'
export { getAllNotes as getTodasNotasVault } from './vault/noteQueries.js'
export { getNotesForGraph as getNotasParaGrafoVault } from './vault/noteQueries.js'
export { getAllNotesMetadata as getTodasNotasMetadataVault } from './vault/noteQueries.js'
export { getBacklinks as getBacklinksVault } from './vault/noteQueries.js'
export { getTemplates as getTemplatesVault } from './vault/noteQueries.js'
export { readTemplate as lerTemplateVault } from './vault/noteQueries.js'

// Folder operations — new English names
export {
  getNotebooks,
  createNotebook,
  moveNotebook,
  remapCadernoConfigs,
  deleteNotebook,
  createSubfolder,
  resolveAbsolutePath,
  propagateRename,
} from './vault/folderOps.js'
// Backward-compatible aliases
export { getNotebooks as getCadernosVault } from './vault/folderOps.js'
export { createNotebook as criarCadernoVault } from './vault/folderOps.js'
export { moveNotebook as moverCadernoVault } from './vault/folderOps.js'
export { deleteNotebook as deletarCadernoVault } from './vault/folderOps.js'
export { createSubfolder as criarSubpastaVault } from './vault/folderOps.js'
export { resolveAbsolutePath as resolverPastaAbsVault } from './vault/folderOps.js'
export { propagateRename as propagarRenameVault } from './vault/folderOps.js'

// Monthly data — new English names
export { getMesPath, getMonth, saveMonth, getAllMonths, saveDayFromGrid } from './vault/monthIO.js'
// Backward-compatible aliases
export { getMonth as getMesVault } from './vault/monthIO.js'
export { saveMonth as salvarMesVault } from './vault/monthIO.js'
export { getAllMonths as getTodosMesesVault } from './vault/monthIO.js'

// Month Tab IO — category/meta operations
export {
  createCategory, createMetaItem, toggleMetaItem, deleteMetaItem, deleteCategory,
  saveResumoNote,
} from './vault/monthIO.js'

// Vault initialization
export { initVault } from './vault/initVault.js'
