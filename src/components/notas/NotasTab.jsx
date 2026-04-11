/**
 * NotasTab.jsx — Notes tab shell
 *
 * Orchestrates hooks for vault index, tabs, autosave, and note actions.
 * Renders: sidebar, editor, outline panel, modals.
 */

import { useState, useEffect, useRef } from 'react'
import {
  criarNotaVazia, salvarNota, getNotasPorCaderno,
  getBacklinks, splitCadernoPath,
} from '../../db/index'
import { useVaultIndex } from './useVaultIndex'
import { useNoteTabs } from './useNoteTabs'
import { useAutoSave } from './useAutoSave'
import { useNoteActions } from './useNoteActions'
import { useDailyNote } from './useDailyNote'
import { useWikilinks } from './useWikilinks'
import { useVault } from '../../contexts/VaultContext'
import { NotesSidebar } from './NotesSidebar'
import { NoteEditorCM } from './NoteEditorCM'
import { OutlinePanel } from './OutlinePanel'
import { TemplateModal } from './TemplateModal'
import NoteActionsMenu from './NoteActionsMenu'
import { useSidebarResize } from '../../hooks/useSidebarResize'
import { NotasModals } from './NotasModals'

// ── Component ─────────────────────────────────────────────────────────────────

export function NotasTab({ textura = 'none', notaPendente, onNotaAberta, onNotaAtiva }) {
  const { vaultPath } = useVault()

  const [backlinks, setBacklinks] = useState([])
  const [folderModal, setFolderModal] = useState(null)

  // Committed titles ref — key: note.id, value: title at time of navigation
  const committedTitlesRef = useRef(new Map())

  // Vault index
  const { vaultIndexRef, buildVaultIndex, invalidateIndex, getSuggestions } = useVaultIndex(vaultPath)

  // Shared refs (used by multiple hooks)
  const saveTimer     = useRef(null)
  const activeNoteRef = useRef(null)
  const wasEditedRef  = useRef(false)
  const commitTitleIfNeededRef = useRef(async () => {})

  // Tabs
  const {
    tabs, activeTabIdx, activeNote, activeNotebook, navKey,
    canGoBack, canGoForward,
    setNavKey, setTabs, updateTab, navigateTo, updateNoteInTab,
    goBack, goForward, addTab, closeTab, switchTab,
  } = useNoteTabs({
    vaultIndexRef,
    activeNoteRef,
    wasEditedRef,
    committedTitlesRef,
    commitTitleIfNeeded: (...args) => commitTitleIfNeededRef.current(...args),
    saveTimer,
    setNotes: (v) => noteActionsRef.current?.setNotes?.(v),
  })

  // Autosave
  const { saveStatus, setSaveStatus, scheduleSave } = useAutoSave({
    activeNoteRef,
    saveTimer,
    commitTitleIfNeeded: (...args) => commitTitleIfNeededRef.current(...args),
  })

  // Note actions (CRUD, folder ops, menu handlers)
  // Uses a ref so useNoteTabs setNotes callback can reach it
  const noteActionsRef = useRef(null)
  const actions = useNoteActions({
    vaultPath,
    activeNote,
    activeNotebook,
    activeNoteRef,
    wasEditedRef,
    committedTitlesRef,
    vaultIndexRef,
    buildVaultIndex,
    invalidateIndex,
    saveTimer,
    saveStatus,
    setSaveStatus,
    scheduleSave,
    navigateTo,
    updateTab,
    updateNoteInTab,
    setTabs,
    setFolderModal,
  })
  noteActionsRef.current = actions

  const {
    notebooks, notes, notesByNotebook, subfoldersByNotebook, rootNotes,
    loadNotebookNotes, createNote, createNotebook,
    deleteNotebook, deleteNote, updateActiveNote, switchNote,
    handleMoveNote, handleMoveNotebook, handleFolderAction,
    commitTitleIfNeeded, handleMenuRename, handleMenuMove,
    handleMenuDelete, handleMenuOpenExternal, setNotes,
  } = actions

  // Wire up commitTitleIfNeeded ref for other hooks
  commitTitleIfNeededRef.current = commitTitleIfNeeded

  // Editor refs (main pane)
  const editorRef = useRef(null)
  const cmViewRef = useRef(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const { width: sidebarWidth, collapsed: sidebarCollapsed, toggleCollapsed: toggleSidebar, onResizeStart: onSidebarResize } = useSidebarResize()
  const [showTemplates, setShowTemplates] = useState(false)

  // Split pane (second editor, side by side)
  const [splitNote, setSplitNote] = useState(null)
  const [splitBacklinks, setSplitBacklinks] = useState([])
  const splitEditorRef = useRef(null)
  const splitCmViewRef = useRef(null)
  const [splitNavKey, setSplitNavKey] = useState(0)
  const [splitOutlineOpen, setSplitOutlineOpen] = useState(false)
  const splitOpen = !!splitNote
  const isDraggingSplitRef = useRef(false)
  const [splitWidth, setSplitWidth] = useState(() => {
    const saved = localStorage.getItem('paraverso-split-width')
    return saved ? parseInt(saved, 10) : 50
  })

  // Open a note in the split pane
  function openInSplit(nota) {
    setSplitNote(nota)
    setSplitNavKey(k => k + 1)
  }

  // Close split pane
  function closeSplit() {
    setSplitNote(null)
  }

  // Split resize handler (same pattern as BrowserPane)
  function handleSplitResizeStart(e) {
    e.preventDefault()
    isDraggingSplitRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const container = e.currentTarget.parentElement
    const onMove = (moveEvent) => {
      if (!isDraggingSplitRef.current || !container) return
      const rect = container.getBoundingClientRect()
      const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSplitWidth(Math.max(25, Math.min(75, pct)))
    }
    const onUp = () => {
      isDraggingSplitRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      setSplitWidth(w => {
        localStorage.setItem('paraverso-split-width', String(Math.round(w)))
        return w
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Load backlinks for split note
  useEffect(() => {
    if (!splitNote?.titulo) { setSplitBacklinks([]); return }
    let cancelled = false
    getBacklinks(splitNote.titulo)
      .then(bls => {
        if (!cancelled) setSplitBacklinks(bls.filter(b => b._filename !== splitNote._filename && b.id !== splitNote.id))
      })
      .catch(() => { if (!cancelled) setSplitBacklinks([]) })
    return () => { cancelled = true }
  }, [splitNote?.id, splitNote?.titulo]) // eslint-disable-line

  // ── Notify active note to other components (GraphTab) ──────────────────────
  useEffect(() => { onNotaAtiva?.(activeNote?.id ?? null) }, [activeNote?.id]) // eslint-disable-line

  // ── Backlinks (lazy, computed when note opens) ──────────────────────────────

  useEffect(() => {
    if (!activeNote?.titulo) { setBacklinks([]); return }
    let cancelled = false
    getBacklinks(activeNote.titulo)
      .then(bls => {
        if (!cancelled) {
          setBacklinks(bls.filter(b => b._filename !== activeNote._filename && b.id !== activeNote.id))
        }
      })
      .catch(() => { if (!cancelled) setBacklinks([]) })
    return () => { cancelled = true }
  }, [activeNote?.id, activeNote?.titulo, activeNote?._filename]) // eslint-disable-line

  // ── Wikilinks (provided by useWikilinks hook) ──────────────────────────────
  const { handleWikilinkClick } = useWikilinks({
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
  })

  // ── Templates (Cmd+T) ──────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        if (activeNote) setShowTemplates(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeNote])

  function insertTemplate(rawMarkdown) {
    if (!editorRef.current) return
    editorRef.current.insertMarkdown(rawMarkdown)
    wasEditedRef.current = true
    setShowTemplates(false)
  }

  // ── Daily note (provided by useDailyNote hook) ──────────────────────────────
  const { createDailyNote } = useDailyNote({
    activeNotebook,
    notebooks,
    vaultIndexRef,
    buildVaultIndex,
    invalidateIndex,
    navigateTo,
    updateTab,
    setNotes,
    loadRootNotes: actions.loadRootNotes,
  })

  // ── Global events ──────────────────────────────────────────────────────────

  // paraverso:vault-changed (Month Tab patched a daily note externally)
  useEffect(() => {
    async function handleVaultChanged(e) {
      invalidateIndex()
      const changedPath = e.detail?.filePath
      const nota = activeNoteRef.current
      if (!changedPath || !nota?._filename) return
      if (wasEditedRef.current) return
      const notaFile = nota._filename + '.md'
      if (!changedPath.endsWith(notaFile)) return
      const caderno = nota.caderno || ''
      const lista = await getNotasPorCaderno(caderno)
      const fresh = lista.find(n => n._filename === nota._filename || n.id === nota.id)
      if (fresh) {
        activeNoteRef.current = fresh
        wasEditedRef.current = false
        setNavKey(k => k + 1)
        updateNoteInTab(fresh)
      }
    }
    window.addEventListener('paraverso:vault-changed', handleVaultChanged)
    return () => window.removeEventListener('paraverso:vault-changed', handleVaultChanged)
  }, [])

  // Refresh vault data when Notes tab becomes visible (e.g., after editing in Month tab)
  useEffect(() => {
    function handleTabVisible() {
      invalidateIndex()
      buildVaultIndex()
      // Reload notes for active notebook + root notes so new files appear
      if (activeNotebook) {
        getNotasPorCaderno(activeNotebook).then(lista => setNotes(lista))
          .catch(err => console.warn('[NotasTab.reloadOnVisible]', err?.message))
      }
      actions.loadRootNotes()
    }
    window.addEventListener('paraverso:notas-visible', handleTabVisible)
    return () => window.removeEventListener('paraverso:notas-visible', handleTabVisible)
  }, [activeNotebook]) // eslint-disable-line

  // paraverso:nova-nota (Cmd+N)
  useEffect(() => {
    async function handleNewNote() {
      const defaultConfig = (await window.electron?.getConfig('defaultCaderno')) || ''
      const { caderno: defaultCad, subpasta: defaultSub } = splitCadernoPath(defaultConfig)
      // If user hasn't set a default folder, create note at vault root (not active notebook)
      const targetNotebook = defaultConfig ? defaultCad : ''
      if (targetNotebook && targetNotebook !== activeNotebook) {
        updateTab(() => ({ caderno: targetNotebook }))
      }
      await createNote(undefined, targetNotebook, defaultSub)
    }
    window.addEventListener('paraverso:nova-nota', handleNewNote)
    return () => window.removeEventListener('paraverso:nova-nota', handleNewNote)
  }, [activeNotebook, notebooks]) // eslint-disable-line

  // paraverso:criar-nota (create note from other modules)
  useEffect(() => {
    async function handleCreateNote(e) {
      const { titulo, caderno: targetCad, subpasta } = e.detail
      const key = titulo.normalize('NFC').toLowerCase()
      let meta = vaultIndexRef.current.get(key)
      if (!meta) {
        const fresh = await buildVaultIndex()
        meta = fresh.get(key)
      }
      if (meta) return

      const targetNotebook = targetCad || activeNotebook
      const nota = criarNotaVazia(targetNotebook)
      nota.titulo = titulo
      if (subpasta) nota.subpasta = subpasta
      await salvarNota(nota)
      invalidateIndex()

      if (targetNotebook === activeNotebook) {
        const lista = await getNotasPorCaderno(activeNotebook)
        setNotes(lista)
      }
    }
    window.addEventListener('paraverso:criar-nota', handleCreateNote)
    return () => window.removeEventListener('paraverso:criar-nota', handleCreateNote)
  }, [activeNotebook]) // eslint-disable-line

  // ── Pending note (QuickSwitcher) ───────────────────────────────────────────

  useEffect(() => {
    if (!notaPendente) return
    let cancelled = false

    async function openNote() {
      let nota = notaPendente

      if (nota._criar && nota.titulo) {
        if (cancelled) return
        const key = nota.titulo.normalize('NFC').toLowerCase()
        let meta = vaultIndexRef.current.get(key)
        if (!meta) {
          const fresh = await buildVaultIndex()
          meta = fresh.get(key)
        }
        if (meta) {
          const targetNotebook = meta.caderno || activeNotebook
          const lista = await getNotasPorCaderno(targetNotebook)
          if (!cancelled) setNotes(lista)
          const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
          const complete = lista.find(n =>
            n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
          )
          if (!cancelled && complete) {
            navigateTo(complete, targetNotebook)
            onNotaAberta?.()
          }
        } else {
          if (!cancelled) {
            await createNote(nota.titulo)
            onNotaAberta?.()
          }
        }
        return
      }

      if (!nota.conteudo) {
        try {
          // Use nota.caderno for lookup ('' = root). Don't fall back to activeNotebook
          // because that could be a different folder than where the note actually lives.
          const targetNotebook = nota.caderno ?? activeNotebook
          const lista = await getNotasPorCaderno(targetNotebook)
          if (!cancelled) setNotes(lista)
          const complete = lista.find(n =>
            n._filename === nota._filename || n.id === nota.id
          )
          if (complete) nota = complete
        } catch { /* continue with metadata-only */ }
      }

      if (!cancelled) {
        navigateTo(nota, nota.caderno || activeNotebook)
        onNotaAberta?.()
      }
    }

    openNote()
    return () => { cancelled = true }
  }, [notaPendente]) // eslint-disable-line

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden bg-bg dark:bg-bg-dark">

      {showTemplates && (
        <TemplateModal
          onInsert={insertTemplate}
          onClose={() => setShowTemplates(false)}
          titulo={activeNote?.titulo}
        />
      )}

      {/* Sidebar */}
      <NotesSidebar
        cadernos={notebooks}
        notas={notes}
        notasRaiz={rootNotes}
        caderno={activeNotebook}
        setCaderno={c => updateTab(() => ({ caderno: c, nota: null }))}
        notaSelecionada={activeNote}
        setNotaSelecionada={switchNote}
        onOpenInSplit={openInSplit}
        onNovaNota={() => createNote(undefined, activeNotebook || '')}
        onNovaNotaRaiz={() => createNote(undefined, '')}
        onNovoCaderno={createNotebook}
        onDeletarCaderno={deleteNotebook}
        onDeletarNota={deleteNote}
        onMoverNota={handleMoveNote}
        onMoverCaderno={handleMoveNotebook}
        onFolderAction={handleFolderAction}
        notasPorCaderno={notesByNotebook}
        subpastasPorCaderno={subfoldersByNotebook}
        onCarregarCaderno={loadNotebookNotes}
        width={sidebarWidth}
        collapsed={sidebarCollapsed}
        toggleCollapsed={toggleSidebar}
        onResizeStart={onSidebarResize}
        vaultPath={vaultPath}
      />

      {/* Folder action modals */}
      <NotasModals
        folderModal={folderModal}
        setFolderModal={setFolderModal}
        cadernos={notebooks}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-bg dark:bg-bg-dark">
        {/* Nav bar */}
        <div
          className="flex items-center px-3 relative shrink-0"
          style={{ height: window.electron ? '48px' : '36px', paddingTop: window.electron ? '12px' : '0', WebkitAppRegion: 'drag' }}
        >
          {/* Nav < > */}
          <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', gap: '2px', alignItems: 'center' }}>
            <button
              onClick={goBack}
              disabled={!canGoBack}
              style={{ background: 'transparent', border: 'none', cursor: canGoBack ? 'pointer' : 'default', color: '#3d3d3a', fontSize: '16px', lineHeight: 1, padding: '2px 4px', borderRadius: '3px', opacity: canGoBack ? 1 : 0.3 }}
              onMouseEnter={e => { if (canGoBack) e.currentTarget.style.color = '#888' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#3d3d3a' }}
            >&#8249;</button>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              style={{ background: 'transparent', border: 'none', cursor: canGoForward ? 'pointer' : 'default', color: '#3d3d3a', fontSize: '16px', lineHeight: 1, padding: '2px 4px', borderRadius: '3px', opacity: canGoForward ? 1 : 0.3 }}
              onMouseEnter={e => { if (canGoForward) e.currentTarget.style.color = '#888' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#3d3d3a' }}
            >&#8250;</button>
          </div>

          {/* Breadcrumb */}
          {activeNote && (
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
              <span style={{ fontSize: '11px', color: '#4a4a4a', userSelect: 'none' }}>
                {(activeNote.folder || activeNote.caderno) && <>{(activeNote.folder || activeNote.caderno).replace(/\//g, ' / ')}  /  </>}
                {activeNote.titulo}
              </span>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Save status + Outline toggle */}
          <div style={{ WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {saveStatus !== 'idle' && (
              <span className={`text-[10px] px-1.5 shrink-0 ${
                saveStatus === 'saving' ? 'opacity-50' : saveStatus === 'saved' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
              }`} style={{ color: saveStatus === 'saving' ? '#4a4a4a' : undefined }}>
                {saveStatus === 'saving' ? '•••' : saveStatus === 'saved' ? '✓' : '⚠'}
              </span>
            )}
            <NoteActionsMenu
              nota={activeNote}
              cadernos={notebooks}
              vaultPath={vaultPath}
              onRename={handleMenuRename}
              onMove={handleMenuMove}
              onDelete={handleMenuDelete}
              onOpenExternal={handleMenuOpenExternal}
            />
            <button
              onClick={() => setOutlineOpen(o => !o)}
              title="Índice da nota"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: outlineOpen ? '#e4e4e4' : '#3d3d3a',
                padding: '2px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={e => { if (!outlineOpen) e.currentTarget.style.color = '#888' }}
              onMouseLeave={e => { if (!outlineOpen) e.currentTarget.style.color = '#3d3d3a' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="7" y1="12" x2="21" y2="12" />
                <line x1="11" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Editor area — split-capable */}
        {activeNote ? (
          <div className="flex-1 flex min-w-0 overflow-hidden">
            {/* Left pane (main editor) */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={splitOpen ? { flexBasis: `${splitWidth}%`, flexGrow: 0 } : undefined}>
              <NoteEditorCM
                key={navKey}
                nota={activeNote}
                textura={textura}
                editorRef={editorRef}
                cmViewRef={cmViewRef}
                backlinks={backlinks}
                getSuggestions={getSuggestions}
                onTituloChange={titulo => updateActiveNote({ titulo })}
                onTituloBlur={async () => {
                  if (saveTimer.current) {
                    clearTimeout(saveTimer.current)
                    saveTimer.current = null
                    const nota = activeNoteRef.current
                    if (nota) {
                      await salvarNota(nota)
                      invalidateIndex()
                      if (nota.caderno) {
                        const lista = await getNotasPorCaderno(nota.caderno)
                        setNotes(lista)
                      } else {
                        await actions.loadRootNotes()
                      }
                    }
                  }
                  if (activeNote?.id) await commitTitleIfNeeded(activeNote.id)
                }}
                onConteudoChange={markdown => {
                  wasEditedRef.current = true
                  updateActiveNote({ _rawMarkdown: markdown, conteudo: null })
                }}
                onWikiLinkClick={handleWikilinkClick}
              />
              <OutlinePanel cmViewRef={cmViewRef} isOpen={outlineOpen} />
            </div>

            {/* Split resize handle + right pane */}
            {splitOpen && (
              <>
                <div
                  onMouseDown={handleSplitResizeStart}
                  style={{ width: 4, cursor: 'col-resize', background: '#2a2a2a', flexShrink: 0, borderLeft: '1px solid #333', borderRight: '1px solid #333' }}
                />
                <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ flexBasis: `${100 - splitWidth}%`, flexGrow: 0 }}>
                  {/* Split pane header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: '#4a4a4a', userSelect: 'none' }}>
                      {(splitNote.folder || splitNote.caderno) && <>{(splitNote.folder || splitNote.caderno).replace(/\//g, ' / ')}  /  </>}
                      {splitNote.titulo}
                    </span>
                    <button
                      onClick={closeSplit}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a4a4a', fontSize: 14, padding: '0 4px' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#e4e4e4' }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#4a4a4a' }}
                      title="Fechar painel"
                    >✕</button>
                  </div>
                  <NoteEditorCM
                    key={splitNavKey}
                    nota={splitNote}
                    textura={textura}
                    editorRef={splitEditorRef}
                    cmViewRef={splitCmViewRef}
                    backlinks={splitBacklinks}
                    getSuggestions={getSuggestions}
                    onTituloChange={() => {}}
                    onTituloBlur={() => {}}
                    onConteudoChange={markdown => {
                      // Save split pane changes directly (no autosave timer sharing)
                      const updated = { ...splitNote, _rawMarkdown: markdown, conteudo: null, editadaEm: Date.now() }
                      setSplitNote(updated)
                      salvarNota(updated).catch(e => console.error('[Split save]', e))
                    }}
                    onWikiLinkClick={titulo => {
                      // Clicking a wikilink in split pane opens it in split
                      const key = titulo.split('|')[0].trim().normalize('NFC').toLowerCase()
                      const meta = vaultIndexRef.current.get(key)
                      if (meta) {
                        getNotasPorCaderno(meta.caderno || '').then(lista => {
                          const full = lista.find(n => n.id === meta.id || n._filename === meta._filename)
                          if (full) openInSplit(full)
                        })
                      }
                    }}
                  />
                  <OutlinePanel cmViewRef={splitCmViewRef} isOpen={splitOutlineOpen} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="text-center space-y-1">
              <p className="text-ink-2 dark:text-ink-dark2 text-sm">Nenhuma nota aberta</p>
              <p className="text-ink-3 dark:text-ink-dark3 text-xs">Crie uma nova ou use <kbd className="px-1.5 py-0.5 rounded-soft border border-bdr dark:border-bdr-dark text-[10px] font-mono">⌘O</kbd> pra buscar</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createNote()} className="btn-secondary text-sm">
                + Nova nota
              </button>
              <button onClick={createDailyNote} className="btn-secondary text-sm">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8"  y1="2" x2="8"  y2="6" />
                  <line x1="3"  y1="10" x2="21" y2="10" />
                </svg>
                Nota do dia
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
