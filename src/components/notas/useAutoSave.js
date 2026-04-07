/**
 * useAutoSave.js — Autosave timer, status indicator, and beforeunload flush
 *
 * Manages the debounced save timer and provides save status
 * ('idle' | 'saving' | 'saved' | 'error') for the UI indicator.
 */

import { useEffect, useRef, useState } from 'react'
import { salvarNota } from '../../db/index'

export function useAutoSave({
  activeNoteRef,
  saveTimer,
  commitTitleIfNeeded,
}) {
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveStatusTimer = useRef(null)

  // Flush autosave on beforeunload / unmount.
  // Uses activeNoteRef (sync ref) instead of React state (may be stale).
  useEffect(() => {
    function flushSave() {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      const nota = activeNoteRef.current
      if (nota) {
        salvarNota(nota).catch(e => console.error('[Flush save]', e))
        if (nota.id) commitTitleIfNeeded(nota.id).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', flushSave)
    return () => {
      window.removeEventListener('beforeunload', flushSave)
      // Flush on unmount (tab switch) — without this, pending debounce is lost
      flushSave()
      // Clear status timer to avoid setState on unmounted component
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
    }
  }, []) // empty deps: registers once, always reads from refs

  /**
   * Schedules a debounced save for the given note.
   * Called from updateActiveNote after updating refs and state.
   */
  function scheduleSave(nota, invalidateIndex) {
    setSaveStatus('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await salvarNota(nota)
        invalidateIndex()
        setSaveStatus('saved')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (err) {
        console.error('[Autosave] Failed to save note:', err)
        setSaveStatus('error')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 4000)
      }
    }, 700)
  }

  return { saveStatus, setSaveStatus, saveStatusTimer, scheduleSave }
}
