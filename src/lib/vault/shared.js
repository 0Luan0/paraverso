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

// ── Code block detection (shared by rename propagation + backlinks) ──────────

/**
 * Finds all code block ranges (fenced ``` and inline `) in text.
 * Returns array of [startIndex, endIndex] pairs.
 */
export function buildCodeSkipRanges(text) {
  const ranges = []
  // Fenced code blocks: ```...```
  const fenceRe = /```[\s\S]*?```/g
  let m
  while ((m = fenceRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }
  // Inline code: `...`
  const inlineRe = /`[^`\n]+`/g
  while ((m = inlineRe.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length])
  }
  return ranges
}

/** Checks if a character position falls inside any code block range. */
export function isInCodeBlock(pos, ranges) {
  return ranges.some(([s, e]) => pos >= s && pos < e)
}
