/**
 * vault/shared.js — Shared constants, helpers, and IPC bridge.
 * Used by all vault modules. No business logic here.
 */

export const el = () => window.electron

// Reserved folder names — excluded from cadernos list and general file search.
export const RESERVED_DIRS = new Set(['meses', '_machine'])

// Configurable templates directory (default: 'templates'). Updated by ConfigTab.
let configuredTemplatesDir = 'templates'
export function setTemplatesDir(nome) { configuredTemplatesDir = nome || 'templates' }
export function getTemplatesDir() { return configuredTemplatesDir }

export function sanitizeName(name) {
  return (name || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
}

export function filenameToId(filename) {
  return filename.replace(/\.md$/i, '')
}
