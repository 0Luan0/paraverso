/**
 * useNoteActions.js — Note and notebook CRUD operations
 *
 * Handles: create note, delete note, move note, switch note,
 * update active note, notebook CRUD, folder actions, and vault refresh.
 */

import { useState, useEffect } from 'react'
import {
  db, getCadernos, criarCaderno, criarNotaVazia,
  salvarNota, deletarNota, moverNota, getNotasPorCaderno, getSubfolders, getVaultPath,
  moverCaderno, remapCadernoConfigs, splitCadernoPath, propagarRename,
  deletarCaderno as deletarCadernoVault, criarSubpasta, resolverPastaAbs,
} from '../../db/index'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deletarCadernoDB(id, nome) {
  const notas = await getNotasPorCaderno(nome)
  for (const n of notas) await deletarNota(n.id)
  if (!getVaultPath()) await db.cadernos.delete(id)
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNoteActions({
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
}) {
  const [notebooks, setNotebooks]     = useState([])
  const [notes, setNotes]             = useState([])
  const [notesByNotebook, setNotesByNotebook] = useState({})
  const [subfoldersByNotebook, setSubfoldersByNotebook] = useState({})
  const [rootNotes, setRootNotes]     = useState([])

  // ── Load root notes ───────────────────────────────────────────────────────

  async function loadRootNotes() {
    if (!vaultPath) { setRootNotes([]); return }
    try {
      const lista = await getNotasPorCaderno('')
      setRootNotes(lista || [])
    } catch {
      setRootNotes([])
    }
  }

  // ── Load notebooks on vault change ──────────────────────────────────────────

  useEffect(() => {
    getCadernos().then(lista => {
      setNotebooks(lista)
      if (lista.length > 0) {
        setTabs(prev => {
          if (prev[0].caderno) return prev
          const next = [...prev]
          next[0] = { ...next[0], caderno: lista[0].nome }
          return next
        })
      }
    })
    loadRootNotes()
    // Eager-load _machine notes so drag-and-drop works even when hemisphere is collapsed
    getNotasPorCaderno('_machine')
      .then(lista => setNotesByNotebook(prev => ({ ...prev, _machine: lista })))
      .catch(() => {})
  }, [vaultPath]) // eslint-disable-line

  // ── Load notes when active notebook changes ─────────────────────────────────

  useEffect(() => {
    let cancelled = false
    const notebook = activeNotebook || ''
    getNotasPorCaderno(notebook)
      .then(lista => { if (!cancelled) setNotes(lista) })
      .catch(() => { if (!cancelled) setNotes([]) })
    if (notebook) {
      getSubfolders(notebook)
        .then(folders => { if (!cancelled) setSubfoldersByNotebook(prev => ({ ...prev, [notebook]: folders })) })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [activeNotebook, vaultPath]) // eslint-disable-line

  // Load notes for a notebook WITHOUT changing active notebook (sidebar expand).
  // Always loads if not cached yet; skips if already in cache (reset by refreshVaultState).
  async function loadNotebookNotes(name) {
    if (notesByNotebook[name] !== undefined) return
    try {
      const [lista, folders] = await Promise.all([
        getNotasPorCaderno(name),
        getSubfolders(name),
      ])
      setNotesByNotebook(prev => ({ ...prev, [name]: lista }))
      setSubfoldersByNotebook(prev => ({ ...prev, [name]: folders }))
    } catch {
      setNotesByNotebook(prev => ({ ...prev, [name]: [] }))
    }
  }

  // Sync notesByNotebook cache when active notebook loads
  useEffect(() => {
    if (activeNotebook && notes.length > 0) {
      setNotesByNotebook(prev => ({ ...prev, [activeNotebook]: notes }))
    }
  }, [notes, activeNotebook]) // eslint-disable-line

  // ── Vault refresh (used by folder actions and focus sync) ───────────────────

  async function refreshVaultState() {
    const newNotebooks = await getCadernos()
    setNotebooks(newNotebooks)
    setNotesByNotebook({})
    setSubfoldersByNotebook({})
    await loadRootNotes()
    invalidateIndex()
    await buildVaultIndex()
    const reloads = []
    if (activeNotebook) {
      reloads.push(getNotasPorCaderno(activeNotebook).then(lista => setNotes(lista)))
      reloads.push(getSubfolders(activeNotebook).then(folders => setSubfoldersByNotebook(prev => ({ ...prev, [activeNotebook]: folders }))))
    }
    reloads.push(getNotasPorCaderno('_machine').then(lista => setNotesByNotebook(prev => ({ ...prev, _machine: lista }))))
    await Promise.all(reloads)
    return newNotebooks
  }

  // ── Sync with Finder changes (refocus) ──────────────────────────────────────

  useEffect(() => {
    if (!vaultPath) return
    async function refreshVault() {
      try {
        const newNotebooks = await getCadernos()
        setNotebooks(newNotebooks)
        setNotesByNotebook({})
    setSubfoldersByNotebook({})
        await loadRootNotes()
        await buildVaultIndex()
        const reloads = []
        if (activeNotebook) reloads.push(getNotasPorCaderno(activeNotebook).then(lista => setNotes(lista)))
        reloads.push(getNotasPorCaderno('_machine').then(lista => setNotesByNotebook(prev => ({ ...prev, _machine: lista }))))
        await Promise.all(reloads)
      } catch (err) {
        console.warn('[refreshVault on focus] failed:', err?.message)
      }
    }
    window.addEventListener('focus', refreshVault)
    return () => window.removeEventListener('focus', refreshVault)
  }, [vaultPath, activeNotebook]) // eslint-disable-line

  // ── CRUD: Create note ───────────────────────────────────────────────────────

  async function createNote(initialTitle, targetNotebook, subfolder) {
    const notebook = targetNotebook !== undefined ? targetNotebook : activeNotebook
    const nota     = criarNotaVazia(notebook || '')
    // Set unified folder path
    const folder = subfolder ? `${notebook}/${subfolder}` : (notebook || '')
    nota.folder = folder
    if (subfolder) nota.subpasta = subfolder  // legacy compat for sidebar tree
    const baseName = initialTitle || nota.titulo
    const lista = notebook ? await getNotasPorCaderno(notebook) : rootNotes
    const existingNames = lista.map(n => n.titulo)
    if (existingNames.includes(baseName)) {
      let i = 2
      while (existingNames.includes(`${baseName} ${i}`)) i++
      nota.titulo = `${baseName} ${i}`
    } else {
      nota.titulo = baseName
    }
    await salvarNota(nota)
    invalidateIndex()
    if (notebook) {
      const [updated, folders] = await Promise.all([
        getNotasPorCaderno(notebook),
        getSubfolders(notebook),
      ])
      setNotes(updated)
      // Also update cache so sidebar shows note even in non-active notebooks
      setNotesByNotebook(prev => ({ ...prev, [notebook]: updated }))
      setSubfoldersByNotebook(prev => ({ ...prev, [notebook]: folders }))
    } else {
      await loadRootNotes()
    }
    navigateTo(nota, notebook || '')
    return nota
  }

  // ── CRUD: Create notebook ───────────────────────────────────────────────────

  async function createNotebook(name) {
    await criarCaderno(name)
    const lista = await getCadernos()
    setNotebooks(lista)
    updateTab(() => ({ caderno: name, nota: null }))
  }

  // ── CRUD: Delete notebook ───────────────────────────────────────────────────

  async function deleteNotebook(id, name) {
    if (!confirm(`Remover o caderno "${name}" e todas as suas notas?`)) return
    await deletarCadernoDB(id, name)
    invalidateIndex()
    const lista = await getCadernos()
    setNotebooks(lista)
    if (lista.length > 0) updateTab(() => ({ caderno: lista[0].nome, nota: null }))
    else                  updateTab(() => ({ caderno: '', nota: null }))
  }

  // ── CRUD: Delete note ───────────────────────────────────────────────────────

  async function deleteNote(id) {
    await deletarNota(id)
    invalidateIndex()
    await buildVaultIndex()
    setNotesByNotebook({})
    setSubfoldersByNotebook({})
    await loadRootNotes()
    const reloads = []
    if (activeNotebook) {
      reloads.push(getNotasPorCaderno(activeNotebook))
      reloads.push(getSubfolders(activeNotebook).then(folders => setSubfoldersByNotebook(prev => ({ ...prev, [activeNotebook]: folders }))))
    }
    reloads.push(getNotasPorCaderno('_machine').then(lista => setNotesByNotebook(prev => ({ ...prev, _machine: lista }))))
    const [lista] = await Promise.all(reloads)
    if (activeNotebook && lista) setNotes(lista)

    if (activeNote?.id === id) {
      const candidates = activeNotebook ? lista : rootNotes
      const next = candidates.length > 0 ? candidates[0] : null
      if (next) navigateTo(next, next.caderno || '')
      else      updateTab(() => ({ nota: null }))
    }
  }

  // ── Update active note (title, content, tags) ──────────────────────────────

  function updateActiveNote(fields) {
    const base = activeNoteRef.current || activeNote
    if (!base) return
    const updated = { ...base, ...fields }
    // CodeMirror: _rawMarkdown IS the content — never delete.
    // Legacy TipTap: if conteudo is JSON object, delete _rawMarkdown.
    if (fields.conteudo && typeof fields.conteudo === 'object' && fields.conteudo?.type === 'doc') {
      delete updated._rawMarkdown
      wasEditedRef.current = true
    }
    // Update ref BEFORE setTabs (sync) so beforeunload/closeTab/switchTab
    // always access the latest version of the note.
    activeNoteRef.current = updated
    updateNoteInTab(updated)
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n))
    // Don't schedule save if note wasn't edited AND just opened without touching
    if (!wasEditedRef.current && !fields.titulo && !fields.tags && updated._rawMarkdown !== undefined) {
      setSaveStatus('idle')
      return
    }
    scheduleSave(updated, invalidateIndex)
  }

  // ── Switch note (sidebar click) ────────────────────────────────────────────

  function switchNote(nota) {
    if (nota.id === activeNote?.id) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const prev = activeNoteRef.current || activeNote
      if (prev) salvarNota(prev)
      saveTimer.current = null
    }
    activeNoteRef.current = nota
    navigateTo(nota, nota.caderno || activeNotebook)
  }

  // ── Move note between notebooks ────────────────────────────────────────────

  async function handleMoveNote(nota, newFolder) {
    // newFolder is a single path: "Projetos/Web", "Projetos", or "" (root)
    if (!nota) { console.error('[handleMoveNote] nota is undefined'); return }
    const currentFolder = nota.folder ?? (
      nota.caderno && nota.subpasta ? `${nota.caderno}/${nota.subpasta}`
      : nota.caderno || ''
    )
    if (currentFolder === (newFolder || '')) return

    const sourceTop = currentFolder.split('/')[0] || ''
    const targetTop = (newFolder || '').split('/')[0] || ''
    try {
      await moverNota(nota, newFolder || '')
      setNotes(prev => prev.filter(n => n.id !== nota.id))

      // Refresh source and target top-level folder caches (notes + subfolders)
      setNotesByNotebook(prev => {
        const next = { ...prev }
        if (sourceTop) delete next[sourceTop]
        if (targetTop) delete next[targetTop]
        return next
      })
      const reloads = []
      const affectedTops = new Set([sourceTop, targetTop].filter(Boolean))
      for (const top of affectedTops) {
        reloads.push(getNotasPorCaderno(top).then(lista => setNotesByNotebook(prev => ({ ...prev, [top]: lista }))).catch(() => {}))
        reloads.push(getSubfolders(top).then(folders => setSubfoldersByNotebook(prev => ({ ...prev, [top]: folders }))).catch(() => {}))
      }
      await Promise.all(reloads)

      // Refresh root notes if source or target is vault root
      if (!sourceTop || !targetTop) {
        await loadRootNotes()
      }

      // Always reload active notebook's notes so sidebar updates immediately
      if (activeNotebook) {
        const lista = await getNotasPorCaderno(activeNotebook)
        setNotes(lista)
      } else {
        await loadRootNotes()
      }

      if (activeNote?.id === nota.id) {
        const targetList = targetTop ? await getNotasPorCaderno(targetTop) : rootNotes
        const complete = targetList.find(n => n.id === nota.id)
        if (complete) navigateTo(complete, targetTop)
      }
      invalidateIndex()
    } catch (e) {
      console.error('[handleMoveNote] failed:', e)
    }
  }

  // ── Move notebook/subfolder ────────────────────────────────────────────────

  async function handleMoveNotebook(sourceRelPath, destParentRelPath) {
    if (!sourceRelPath || !vaultPath) return
    const basename = sourceRelPath.split(/[/\\]/).pop()
    const targetRelPath = destParentRelPath
      ? `${destParentRelPath}/${basename}`
      : basename

    try {
      if (activeNote?.id) await commitTitleIfNeeded(activeNote.id)

      const result = await moverCaderno(vaultPath, sourceRelPath, targetRelPath)
      if (result?.noop) return

      const updates = await remapCadernoConfigs(sourceRelPath, targetRelPath)
      for (const u of updates) {
        window.dispatchEvent(new CustomEvent('paraverso:toast', {
          detail: { tipo: 'info', mensagem: `Config ${u.key}: ${u.from} → ${u.to}` }
        }))
      }
      window.dispatchEvent(new CustomEvent('paraverso:pasta-movida', {
        detail: { from: sourceRelPath, to: targetRelPath }
      }))

      const newNotebooks = await getCadernos()
      setNotebooks(newNotebooks)
      setNotesByNotebook({})
    setSubfoldersByNotebook({})
      await loadRootNotes()
      invalidateIndex()
      await buildVaultIndex()

      getNotasPorCaderno('_machine').then(lista => setNotesByNotebook(prev => ({ ...prev, _machine: lista })))

      const topActive = activeNotebook?.split('/')[0]
      const topFrom   = sourceRelPath.split('/')[0]
      if (topActive === topFrom && !newNotebooks.find(c => c.nome === activeNotebook)) {
        updateTab(() => ({ caderno: newNotebooks[0]?.nome || '', nota: null }))
      } else if (activeNotebook) {
        const [lista, folders] = await Promise.all([
          getNotasPorCaderno(activeNotebook),
          getSubfolders(activeNotebook),
        ])
        setNotes(lista)
        setSubfoldersByNotebook(prev => ({ ...prev, [activeNotebook]: folders }))
      }

      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'info', mensagem: `Pasta movida: ${sourceRelPath} → ${targetRelPath || '(raiz)'}` }
      }))
    } catch (err) {
      console.error('[handleMoveNotebook] failed:', err)
      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'erro', mensagem: err?.message || 'Falha ao mover pasta' }
      }))
    }
  }

  // ── Title commit: propagate [[]] renames in wikilinks ──────────────────────

  async function commitTitleIfNeeded(noteId) {
    if (!noteId || !vaultPath) return
    const committed = committedTitlesRef.current.get(noteId)
    if (!committed) return

    const current = activeNoteRef.current?.id === noteId
      ? activeNoteRef.current
      : (notes.find(n => n.id === noteId) || null)
    if (!current || !current.titulo) return
    if (committed === current.titulo) return

    const newKey = current.titulo.normalize('NFC').toLowerCase()
    const existing = vaultIndexRef.current.get(newKey)
    if (existing && existing.id !== noteId) {
      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'erro', mensagem: `Já existe uma nota chamada "${current.titulo}". Escolha outro título.` }
      }))
      updateActiveNote({ titulo: committed })
      return
    }

    try {
      const updated = await propagarRename(vaultPath, committed, current.titulo)
      committedTitlesRef.current.set(noteId, current.titulo)
      if (updated && updated.length > 0) {
        window.dispatchEvent(new CustomEvent('paraverso:toast', {
          detail: { tipo: 'info', mensagem: `Rename: ${updated.length} nota(s) atualizada(s)` }
        }))
      }
    } catch (err) {
      console.warn('[commitTitleIfNeeded] propagation failed:', err?.message)
    }
  }

  // ── Folder context menu actions ────────────────────────────────────────────

  async function handleFolderAction(action, folderRelPath) {
    if (!folderRelPath || !vaultPath) return
    const basename = folderRelPath.split(/[/\\]/).pop()
    const parentPath = folderRelPath.split(/[/\\]/).slice(0, -1).join('/')

    try {
      switch (action) {
        case 'nova-nota': {
          const { caderno: cadTop, subpasta: sub } = splitCadernoPath(folderRelPath)
          await createNote(undefined, cadTop || '', sub || undefined)
          break
        }

        case 'nova-pasta': {
          setFolderModal({
            type: 'input',
            title: `Nova pasta em ${folderRelPath || 'raiz'}`,
            placeholder: 'Nome da pasta',
            defaultValue: '',
            onConfirm: async (name) => {
              setFolderModal(null)
              try {
                await criarSubpasta(vaultPath, folderRelPath, name)
                await refreshVaultState()
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'info', mensagem: `Pasta criada: ${folderRelPath}/${name}` }
                }))
              } catch (err) {
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'erro', mensagem: err?.message || 'Falha ao criar pasta' }
                }))
              }
            },
          })
          break
        }

        case 'renomear': {
          setFolderModal({
            type: 'input',
            title: `Renomear ${basename}`,
            placeholder: 'Novo nome',
            defaultValue: basename,
            onConfirm: async (newName) => {
              setFolderModal(null)
              if (newName === basename) return
              const newPath = parentPath ? `${parentPath}/${newName}` : newName
              try {
                const result = await moverCaderno(vaultPath, folderRelPath, newPath)
                if (result?.noop) return
                const configUpdates = await remapCadernoConfigs(folderRelPath, newPath)
                for (const u of configUpdates) {
                  window.dispatchEvent(new CustomEvent('paraverso:toast', {
                    detail: { tipo: 'info', mensagem: `Config ${u.key}: ${u.from} → ${u.to}` }
                  }))
                }
                window.dispatchEvent(new CustomEvent('paraverso:pasta-movida', {
                  detail: { from: folderRelPath, to: newPath }
                }))
                const newNotebooks = await refreshVaultState()
                const topFrom = folderRelPath.split('/')[0]
                const topTo   = newPath.split('/')[0]
                if (activeNotebook === topFrom) {
                  updateTab(() => ({ caderno: newNotebooks.find(c => c.nome === topTo)?.nome || newNotebooks[0]?.nome || '', nota: null }))
                }
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'info', mensagem: `Renomeada: ${folderRelPath} → ${newPath}` }
                }))
              } catch (err) {
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'erro', mensagem: err?.message || 'Falha ao renomear pasta' }
                }))
              }
            },
          })
          break
        }

        case 'mover': {
          setFolderModal({
            type: 'picker',
            folderPath: folderRelPath,
            onConfirm: async (destParent) => {
              setFolderModal(null)
              if (destParent === parentPath) return
              await handleMoveNotebook(folderRelPath, destParent)
            },
          })
          break
        }

        case 'revelar': {
          const absPath = await resolverPastaAbs(vaultPath, folderRelPath)
          if (window.electron?.showItemInFinder) {
            await window.electron.showItemInFinder(absPath)
          } else if (window.electron?.openPath) {
            await window.electron.openPath(absPath)
          }
          break
        }

        case 'apagar': {
          setFolderModal({
            type: 'confirm',
            message: `Apagar "${folderRelPath}" e todo o conteúdo (notas e subpastas)? Esta ação não pode ser desfeita.`,
            confirmLabel: 'Apagar pasta',
            onConfirm: async () => {
              setFolderModal(null)
              try {
                await deletarCadernoVault(vaultPath, folderRelPath)
                const newNotebooks = await refreshVaultState()
                const topFrom = folderRelPath.split('/')[0]
                if (activeNotebook === topFrom && !newNotebooks.find(c => c.nome === activeNotebook)) {
                  updateTab(() => ({ caderno: newNotebooks[0]?.nome || '', nota: null }))
                }
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'info', mensagem: `Pasta apagada: ${folderRelPath}` }
                }))
              } catch (err) {
                window.dispatchEvent(new CustomEvent('paraverso:toast', {
                  detail: { tipo: 'erro', mensagem: err?.message || 'Falha ao apagar pasta' }
                }))
              }
            },
          })
          break
        }
      }
    } catch (err) {
      console.error('[handleFolderAction] error:', err)
      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'erro', mensagem: err?.message || 'Erro' }
      }))
    }
  }

  // ── Menu handlers ──────────────────────────────────────────────────────────

  async function handleMenuRename(newTitle) {
    if (!activeNote || !vaultPath || newTitle === activeNote.titulo) return

    const newKey = newTitle.normalize('NFC').toLowerCase()
    const existing = vaultIndexRef.current.get(newKey)
    if (existing && existing.id !== activeNote.id) {
      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'erro', mensagem: `Já existe uma nota chamada "${newTitle}". Escolha outro título.` }
      }))
      return
    }

    const oldTitle = activeNote.titulo
    const oldFilename = activeNote._filename || activeNote.titulo || ''
    const newFilename = (newTitle || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
    const notebook = activeNote.caderno || ''
    const subfolder = activeNote.subpasta

    const baseParts = notebook ? [notebook] : []
    if (subfolder) baseParts.push(subfolder)
    const oldPath = await window.electron.joinPath(vaultPath, ...baseParts, oldFilename + '.md')
    const newPath = await window.electron.joinPath(vaultPath, ...baseParts, newFilename + '.md')

    try {
      if (oldPath !== newPath) {
        await window.electron.rename(oldPath, newPath)
      }
      updateActiveNote({ titulo: newTitle, _filename: newFilename })
      wasEditedRef.current = true

      try {
        const updated = await propagarRename(vaultPath, oldTitle, newTitle)
        if (updated && updated.length > 0) {
          window.dispatchEvent(new CustomEvent('paraverso:toast', {
            detail: { tipo: 'info', mensagem: `Rename: ${updated.length} nota(s) atualizada(s)` }
          }))
        }
      } catch (e) {
        console.warn('[handleMenuRename] propagation failed:', e?.message)
      }
      committedTitlesRef.current.set(activeNote.id, newTitle)

      if (activeNotebook) {
        const lista = await getNotasPorCaderno(activeNotebook)
        setNotes(lista)
      } else {
        await loadRootNotes()
      }
      invalidateIndex()
    } catch (err) {
      console.error('[handleMenuRename] error:', err)
      window.dispatchEvent(new CustomEvent('paraverso:toast', {
        detail: { tipo: 'erro', mensagem: `Falha ao renomear: ${err?.message || err}` }
      }))
    }
  }

  async function handleMenuMove(newNotebook) {
    if (!activeNote) return
    await handleMoveNote(activeNote, newNotebook)
  }

  async function handleMenuDelete() {
    if (!activeNote) return
    await deleteNote(activeNote.id)
  }

  async function handleMenuOpenExternal() {
    if (!activeNote || !vaultPath) return
    const filename = activeNote._filename || activeNote.titulo || ''
    const notebook = activeNote.caderno || ''
    const filePath = await window.electron.joinPath(vaultPath, notebook, filename + '.md')
    window.electron.openPath(filePath)
  }

  return {
    notebooks, setNotebooks,
    notes, setNotes,
    notesByNotebook, setNotesByNotebook,
    subfoldersByNotebook,
    rootNotes,
    loadRootNotes,
    loadNotebookNotes,
    refreshVaultState,
    createNote,
    createNotebook,
    deleteNotebook,
    deleteNote,
    updateActiveNote,
    switchNote,
    handleMoveNote,
    handleMoveNotebook,
    handleFolderAction,
    commitTitleIfNeeded,
    handleMenuRename,
    handleMenuMove,
    handleMenuDelete,
    handleMenuOpenExternal,
  }
}
