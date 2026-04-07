/**
 * useDailyNote.js — Daily note (journal entry) creation
 *
 * Creates or navigates to today's daily note.
 * Listens for the 'paraverso:journal' event.
 */

import { useEffect } from 'react'
import { criarNotaVazia, salvarNota, getNotasPorCaderno, splitCadernoPath } from '../../db/index'
import { MESES_PT_LOWER, DIAS_SEMANA } from '../../lib/mesUtils'

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

  async function createDailyNote() {
    const now    = new Date()
    const dia    = now.getDate()
    const mes    = MESES_PT_LOWER[now.getMonth()]
    const ano    = now.getFullYear()
    const diaSem = DIAS_SEMANA[now.getDay()]
    const titulo = `${dia} ${mes} ${ano}`

    const journalConfig = (await window.electron?.getConfig('journalCaderno')) || ''
    const { caderno: journalCad, subpasta: journalSub } = splitCadernoPath(journalConfig)
    const targetNotebook = journalCad || ''

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
    if (journalSub) nota.subpasta = journalSub
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

  // Listen for journal event
  useEffect(() => {
    window.addEventListener('paraverso:journal', createDailyNote)
    return () => window.removeEventListener('paraverso:journal', createDailyNote)
  }, [activeNotebook, notebooks]) // eslint-disable-line

  return { createDailyNote }
}
