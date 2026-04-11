/**
 * useNoteTabs.js — Tab management with per-tab history (back/forward)
 *
 * Each tab has its own note, notebook, and navigation history.
 * Handles tab CRUD, navigation, and history traversal.
 */

import { useState, useRef } from 'react'
import { salvarNota, getNotasPorCaderno } from '../../db/index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function newTab(notebook) {
  return {
    id: Math.random().toString(36).slice(2),
    nota: null,
    caderno: notebook || '',
    history: [],
    histIdx: -1,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNoteTabs({
  vaultIndexRef,
  activeNoteRef,
  wasEditedRef,
  committedTitlesRef,
  commitTitleIfNeeded,
  saveTimer,
  setNotes,
}) {
  const [tabs, setTabs]             = useState([newTab('')])
  const [activeTabIdx, setActiveTabIdx] = useState(0)
  const [navKey, setNavKey]         = useState(0)

  // Derived
  const activeTab      = tabs[activeTabIdx] ?? tabs[0]
  const activeNote     = activeTab?.nota     ?? null
  const activeNotebook = activeTab?.caderno  ?? ''
  const canGoBack      = !!activeTab && activeTab.histIdx > 0
  const canGoForward   = !!activeTab && activeTab.histIdx < activeTab.history.length - 1

  // ── Tab mutation helper ─────────────────────────────────────────────────────

  function updateTab(updater) {
    setTabs(prev => {
      const next    = [...prev]
      const patches = updater(next[activeTabIdx])
      if (!patches || Object.keys(patches).length === 0) return prev
      next[activeTabIdx] = { ...next[activeTabIdx], ...patches }
      return next
    })
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function navigateTo(nota, notebook) {
    if (!nota) return
    const targetNotebook = notebook ?? nota?.caderno ?? activeNotebook

    // Before leaving current note, if its title changed since last commit,
    // propagate [[]] through the vault. Fire-and-forget.
    const previousId = activeNoteRef.current?.id
    if (previousId && previousId !== nota.id) {
      commitTitleIfNeeded(previousId).catch(err => {
        console.warn('[useNoteTabs.commitTitleOnLeave]', err?.message)
      })
    }

    // Record the current title of the new note as "committed" for future comparison
    if (nota.id && nota.titulo && !committedTitlesRef.current.has(nota.id)) {
      committedTitlesRef.current.set(nota.id, nota.titulo)
    }

    wasEditedRef.current = false
    activeNoteRef.current = nota
    setNavKey(k => k + 1)
    updateTab(tab => {
      const newHistory = [...tab.history.slice(0, tab.histIdx + 1), nota.id]
      return { nota, caderno: targetNotebook, history: newHistory, histIdx: newHistory.length - 1 }
    })
  }

  function updateNoteInTab(nota) {
    updateTab(() => ({ nota }))
  }

  // ── Back / Forward ──────────────────────────────────────────────────────────

  async function goBack() {
    const tabSnapshot = activeTabIdx
    const tab = tabs[tabSnapshot]
    if (!tab || tab.histIdx <= 0) return
    const newIdx = tab.histIdx - 1
    const noteId = tab.history[newIdx]
    let nota = null

    // Search current notes list first
    // (We can't access `notes` state here — caller passes setNotes)
    // Search vault index for the note's notebook
    for (const meta of vaultIndexRef.current.values()) {
      if (meta.id === noteId) {
        const lista = await getNotasPorCaderno(meta.caderno)
        if (activeTabIdx !== tabSnapshot) return
        setNotes(lista)
        nota = lista.find(n => n.id === noteId)
        break
      }
    }
    if (!nota || activeTabIdx !== tabSnapshot) return
    wasEditedRef.current = false
    activeNoteRef.current = nota
    setNavKey(k => k + 1)
    setTabs(prev => prev.map((t, i) => i === tabSnapshot ? { ...t, nota, caderno: nota.caderno || t.caderno, histIdx: newIdx } : t))
  }

  async function goForward() {
    const tabSnapshot = activeTabIdx
    const tab = tabs[tabSnapshot]
    if (!tab || tab.histIdx >= tab.history.length - 1) return
    const newIdx = tab.histIdx + 1
    const noteId = tab.history[newIdx]
    let nota = null

    for (const meta of vaultIndexRef.current.values()) {
      if (meta.id === noteId) {
        const lista = await getNotasPorCaderno(meta.caderno)
        if (activeTabIdx !== tabSnapshot) return
        setNotes(lista)
        nota = lista.find(n => n.id === noteId)
        break
      }
    }
    if (!nota || activeTabIdx !== tabSnapshot) return
    wasEditedRef.current = false
    activeNoteRef.current = nota
    setNavKey(k => k + 1)
    setTabs(prev => prev.map((t, i) => i === tabSnapshot ? { ...t, nota, caderno: nota.caderno || t.caderno, histIdx: newIdx } : t))
  }

  // ── Tab CRUD ────────────────────────────────────────────────────────────────

  function addTab() {
    const newIdx = tabs.length
    setTabs(prev => [...prev, newTab(activeNotebook)])
    setActiveTabIdx(newIdx)
  }

  function closeTab(e, idx) {
    e.stopPropagation()
    if (tabs.length === 1) return
    if (idx === activeTabIdx && saveTimer.current) {
      clearTimeout(saveTimer.current)
      const nota = activeNoteRef.current || activeNote
      if (nota) salvarNota(nota)
      saveTimer.current = null
    }
    setTabs(prev => prev.filter((_, i) => i !== idx))
    setActiveTabIdx(prev => {
      if (prev === idx)  return Math.max(0, idx - 1)
      if (prev > idx)    return prev - 1
      return prev
    })
  }

  async function switchTab(idx) {
    if (idx === activeTabIdx) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const nota = activeNoteRef.current || activeNote
      if (nota) await salvarNota(nota)
      saveTimer.current = null
    }
    setActiveTabIdx(idx)
  }

  return {
    tabs,
    activeTabIdx,
    activeNote,
    activeNotebook,
    navKey,
    canGoBack,
    canGoForward,
    setNavKey,
    setTabs,
    updateTab,
    navigateTo,
    updateNoteInTab,
    goBack,
    goForward,
    addTab,
    closeTab,
    switchTab,
  }
}
