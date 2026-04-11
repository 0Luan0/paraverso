/**
 * useWikilinks.js — Wikilink click handler
 *
 * O(1) lookup via vault index. If the note doesn't exist, creates it.
 * Obsidian-style: extract title (ignore alias after |), lookup, create if missing.
 */

import { salvarNota, getNotasPorCaderno } from '../../db/index'

export function useWikilinks({
  activeNote,
  activeNotebook,
  activeNoteRef,
  vaultIndexRef,
  buildVaultIndex,
  saveTimer,
  setNotes,
  navigateTo,
  createNote,
  notes,
}) {
  async function handleWikilinkClick(titleRaw) {
    const titulo = titleRaw.split('|')[0].trim()
    const key    = titulo.normalize('NFC').toLowerCase()

    // 1. Save current note (non-fatal)
    if (activeNote && saveTimer.current) {
      clearTimeout(saveTimer.current)
      try { await salvarNota(activeNote) } catch (err) {
        console.warn('[Wikilink] Failed to save current note:', err?.message)
      }
      saveTimer.current = null
    }

    // 2. Try in-memory index
    let meta = vaultIndexRef.current.get(key)

    // 3. Stale or empty index — rebuild
    if (!meta) {
      const freshIndex = await buildVaultIndex()
      meta = freshIndex.get(key)
    }

    if (meta) {
      const targetNotebook = meta.caderno || activeNotebook

      // 4a. Load target notebook's notes
      let lista = notes
      if (targetNotebook !== activeNotebook) {
        lista = await getNotasPorCaderno(targetNotebook)
        setNotes(lista)
      }

      // 4b. Find complete note in list
      const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
      let complete = lista.find(n =>
        n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
      )

      // 4c. Fallback: reload notebook
      if (!complete) {
        const lista2 = await getNotasPorCaderno(targetNotebook)
        setNotes(lista2)
        complete = lista2.find(n =>
          n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
        )
      }

      if (complete) {
        navigateTo(complete, targetNotebook)
        return
      }
    }

    // 5. Not found — create new note with that title
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      try {
        await salvarNota(activeNoteRef.current)
      } catch (err) {
        console.warn('[useWikilinks.flushSaveBeforeCreate]', err?.message)
      }
    }
    await createNote(titulo)
  }

  return { handleWikilinkClick }
}
