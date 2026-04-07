/**
 * useVaultIndex.js — Vault index (Map<normalizedTitle → metadata>)
 *
 * Builds and maintains an in-memory index of all notes in the vault.
 * Used for O(1) wikilink resolution and autocomplete suggestions.
 */

import { useEffect, useRef } from 'react'
import { getTodasNotasMetadata } from '../../db/index'

export function useVaultIndex(vaultPath) {
  const vaultIndexRef = useRef(new Map())
  const indexBuilding = useRef(false)

  /**
   * Builds a flat vault index — metadata only, no content parsing.
   * getTodasNotasMetadata() uses readdirRecursive and reads only frontmatter.
   * Indexes by normalized title AND by _filename, to cover:
   *  - [[Note with accents]] (title)
   *  - [[note-with-accents]] (filename stem)
   */
  async function buildVaultIndex() {
    if (indexBuilding.current) return vaultIndexRef.current
    indexBuilding.current = true
    try {
      const metadata = await getTodasNotasMetadata()
      const map = new Map()
      for (const nota of metadata) {
        nota.hemisphere = nota.caderno === '_machine' ? 'machine' : 'human'
        const titleKey = nota.titulo?.normalize('NFC').toLowerCase()
        const fnKey    = nota._filename?.normalize('NFC').toLowerCase()
        if (titleKey && !map.has(titleKey)) map.set(titleKey, nota)
        if (fnKey && fnKey !== titleKey) map.set(fnKey, nota)
      }

      vaultIndexRef.current = map
      return map
    } catch (err) {
      console.warn('[VaultIndex] Failed to build index:', err?.message)
      return vaultIndexRef.current
    } finally {
      indexBuilding.current = false
    }
  }

  // Build index on mount and when vault changes
  useEffect(() => { buildVaultIndex() }, [vaultPath])

  /**
   * Invalidates the index by triggering a non-blocking rebuild.
   * Does NOT clear the map — getSuggestions() would see empty results
   * during the rebuild window (~700ms) and autocomplete would break.
   */
  function invalidateIndex() {
    buildVaultIndex()
  }

  /**
   * Autocomplete suggestions for [[wikilink]] input.
   * Returns up to 8 notes matching the query, split between human and machine.
   */
  function getSuggestions(query) {
    const q = (query || '').normalize('NFC').toLowerCase().trim()
    const seen = new Set()
    const human = []
    const machine = []

    for (const meta of vaultIndexRef.current.values()) {
      if (!meta.titulo) continue
      const key = meta.titulo.normalize('NFC').toLowerCase()
      const relKey = meta.relativePath?.normalize('NFC').toLowerCase() || ''
      const dedupKey = meta.hemisphere === 'machine' ? (relKey || key) : key
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)

      if (!q || key.includes(q) || relKey.includes(q)) {
        const entry = {
          titulo:       meta.titulo,
          caderno:      meta.caderno || '',
          subpasta:     meta.subpasta || '',
          editadaEm:    meta.editadaEm || 0,
          prefixo:      key.startsWith(q) || relKey.startsWith(q),
          hemisphere:   meta.hemisphere || 'human',
          relativePath: meta.relativePath || '',
        }
        if (meta.hemisphere === 'machine') machine.push(entry)
        else human.push(entry)
      }
    }

    const sortFn = (a, b) => {
      if (a.prefixo !== b.prefixo) return a.prefixo ? -1 : 1
      return b.editadaEm - a.editadaEm
    }
    human.sort(sortFn)
    machine.sort(sortFn)

    const hSlice = human.slice(0, machine.length > 0 ? 4 : 8)
    const mSlice = machine.slice(0, human.length > 0 ? 4 : 8)
    return [...hSlice, ...mSlice]
  }

  return { vaultIndexRef, buildVaultIndex, invalidateIndex, getSuggestions }
}
