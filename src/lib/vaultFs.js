/**
 * vaultFs.js — Barrel file re-exporting all vault modules.
 *
 * This file used to be 1,490 lines. Now it's split into focused modules
 * under src/lib/vault/. This barrel ensures zero downstream import changes.
 *
 * Modules:
 *   vault/shared.js      — el(), RESERVED_DIRS, sanitizeName, setTemplatesDir
 *   vault/yamlUtils.js    — parseSimpleYaml, parseMdFile, serializeNoteYaml, yamlStr
 *   vault/pathUtils.js    — joinPath, splitCadernoPath, path helpers, file listing
 *   vault/noteIO.js       — salvarNotaVault, moverNotaVault, lerNotaVault, deletarNotaVault
 *   vault/noteQueries.js  — getNotasPorCadernoVault, getTodasNotasVault, backlinks, templates
 *   vault/folderOps.js    — getCadernosVault, moverCadernoVault, propagarRenameVault, etc.
 *   vault/monthIO.js      — getMesVault, salvarMesVault, getTodosMesesVault
 *   vault/initVault.js    — initVault (onboarding)
 */

// Shared
export { setTemplatesDir } from './vault/shared.js'

// Path utilities
export { joinPath, splitCadernoPath } from './vault/pathUtils.js'

// Note CRUD
export { salvarNotaVault, moverNotaVault, lerNotaVault, deletarNotaVault } from './vault/noteIO.js'

// Note queries + templates + backlinks
export {
  getNotasPorCadernoVault,
  getTodasNotasVault,
  getNotasParaGrafoVault,
  getTodasNotasMetadataVault,
  getBacklinksVault,
  getTemplatesVault,
  lerTemplateVault,
} from './vault/noteQueries.js'

// Folder operations
export {
  getCadernosVault,
  criarCadernoVault,
  moverCadernoVault,
  remapCadernoConfigs,
  deletarCadernoVault,
  criarSubpastaVault,
  resolverPastaAbsVault,
  propagarRenameVault,
} from './vault/folderOps.js'

// Monthly data
export { getMesPath, getMesVault, salvarMesVault, getTodosMesesVault } from './vault/monthIO.js'

// Vault initialization
export { initVault } from './vault/initVault.js'
