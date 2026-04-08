/**
 * useDailyNote.js — Daily note (journal entry) creation
 *
 * Creates or navigates to today's daily note.
 * Listens for the 'paraverso:journal' event.
 */

import { useEffect } from 'react'
import { criarNotaVazia, salvarNota, getNotasPorCaderno, splitCadernoPath } from '../../db/index'
import { MESES_PT_LOWER, DIAS_SEMANA, monthFolderName } from '../../lib/mesUtils'

export function useDailyNote({
  activeNotebook,
  notebooks,
  vaultIndexRef,
  buildVaultIndex,
  invalidateIndex,
  navigateTo,
  updateTab,
  setNotes,
  loadRootNotes,
}) {

  async function createDailyNote(targetDate) {
    const now    = targetDate || new Date()
    const dia    = now.getDate()
    const mes    = MESES_PT_LOWER[now.getMonth()]
    const ano    = now.getFullYear()
    const diaSem = DIAS_SEMANA[now.getDay()]
    const titulo = `${dia} ${mes} ${ano}`

    const journalConfig = (await window.electron?.getConfig('journalCaderno')) || 'meses'
    const { caderno: journalCad, subpasta: journalSub } = splitCadernoPath(journalConfig)
    const targetNotebook = journalCad || 'meses'

    // When journal is in 'meses', auto-set subfolder to current month (YYYY-MM)
    // so notes end up at meses/2026-04/8 abril 2026.md — aligned with Month Tab
    const autoSub = journalCad === 'meses' && !journalSub
      ? monthFolderName(ano, now.getMonth() + 1)
      : journalSub

    const key = titulo.normalize('NFC').toLowerCase()
    let meta = vaultIndexRef.current.get(key)
    if (!meta) {
      const fresh = await buildVaultIndex()
      meta = fresh.get(key)
    }

    if (meta) {
      const metaNotebook = meta.caderno || targetNotebook
      if (metaNotebook !== activeNotebook) {
        updateTab(() => ({ caderno: metaNotebook }))
      }
      const lista = await getNotasPorCaderno(metaNotebook)
      setNotes(lista)
      const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
      const complete = lista.find(n =>
        n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
      )
      if (complete) {
        navigateTo(complete, metaNotebook)
        return
      }
    }

    if (targetNotebook !== activeNotebook) {
      updateTab(() => ({ caderno: targetNotebook }))
    }
    const nota = criarNotaVazia(targetNotebook)
    // Set unified folder path
    nota.folder = autoSub ? `${targetNotebook}/${autoSub}` : (targetNotebook || '')
    if (autoSub) nota.subpasta = autoSub  // legacy compat
    nota.titulo = titulo
    nota.conteudo = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `${diaSem}, ${dia} de ${mes} de ${ano}` }] },
        { type: 'paragraph' },
      ],
    }
    await salvarNota(nota)
    invalidateIndex()
    if (targetNotebook) {
      const lista = await getNotasPorCaderno(targetNotebook)
      setNotes(lista)
    } else {
      await loadRootNotes()
    }
    navigateTo(nota, targetNotebook)
  }

  // Listen for journal event — supports optional date in e.detail
  useEffect(() => {
    function handleJournal(e) {
      const date = e.detail?.date ? new Date(e.detail.date) : undefined
      createDailyNote(date)
    }
    window.addEventListener('paraverso:journal', handleJournal)
    return () => window.removeEventListener('paraverso:journal', handleJournal)
  }, [activeNotebook, notebooks]) // eslint-disable-line

  return { createDailyNote }
}
