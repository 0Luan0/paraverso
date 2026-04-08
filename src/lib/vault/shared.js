/**
 * vault/shared.js — Shared constants, helpers, and IPC bridge.
 * Used by all vault modules. No business logic here.
 */

export const el = () => window.electron

// Machine hemisphere folders — visually separate in sidebar/graph, but included
// in all CRUD operations (save, delete, move, search). Not "reserved" anymore.
export const MACHINE_DIRS = new Set(['_machine'])

// Reserved folder names — excluded from note listing and CRUD.
// _machine was removed: it's now a normal folder with visual-only separation.
export const RESERVED_DIRS = new Set()

// Configurable templates directory (default: 'templates'). Updated by ConfigTab.
let configuredTemplatesDir = 'templates'
export function setTemplatesDir(nome) { configuredTemplatesDir = nome || 'templates' }
export function getTemplatesDir() { return configuredTemplatesDir }

/**
 * Sanitizes a name for use as a filename. Returns 'sem-titulo' for falsy input.
 * For folder paths where '' means vault root, callers must guard:
 *   name ? sanitizeName(name) : ''
 */
export function sanitizeName(name) {
  return (name || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
}

export function filenameToId(filename) {
  return filename.replace(/\.md$/i, '')
}
