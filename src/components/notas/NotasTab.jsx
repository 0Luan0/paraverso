/**
 * NotasTab.jsx — Aba de notas do Paraverso
 *
 * Arquitetura inspirada no Obsidian:
 * - Vault Index em memória: Map(titulo_normalizado → metadata) construído uma
 *   vez via getTodasNotasMetadata() (sem parsing de conteúdo). Wikilink click
 *   = lookup O(1), não scan de todos os arquivos.
 * - Navegação com histórico por aba (back/forward estilo browser).
 * - navKey: garante remount do NoteEditorCM a cada navegação → sem race condition.
 * - Backlinks: calculados de forma lazy ao abrir cada nota.
 */

import { useState, useEffect, useRef } from 'react'
import {
  db, getCadernos, criarCaderno, criarNotaVazia,
  salvarNota, deletarNota, moverNota, getNotasPorCaderno, getTodasNotasMetadata,
  getBacklinks, getVaultPath,
} from '../../db/index'
import { useVault } from '../../contexts/VaultContext'
import { NotesSidebar } from './NotesSidebar'
import { NoteEditorCM } from './NoteEditorCM'
import { OutlinePanel } from './OutlinePanel'
import { TemplateModal } from './TemplateModal'
import NoteActionsMenu from './NoteActionsMenu'
import { useSidebarResize } from '../../hooks/useSidebarResize'

// ── Helpers ───────────────────────────────────────────────────────────────────

function novoTab(caderno) {
  return {
    id: Math.random().toString(36).slice(2),
    nota: null,
    caderno: caderno || '',
    history: [],
    histIdx: -1,
  }
}

async function deletarCadernoDB(id, nome) {
  const notas = await getNotasPorCaderno(nome)
  for (const n of notas) await deletarNota(n.id)
  if (!getVaultPath()) await db.cadernos.delete(id)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotasTab({ textura = 'none', notaPendente, onNotaAberta, onNotaAtiva }) {
  const { vaultPath } = useVault()

  const [cadernos, setCadernos] = useState([])
  const [notas, setNotas]       = useState([])
  const [backlinks, setBacklinks] = useState([])
  // Cache de notas por caderno — para expandir pastas sem mudar o caderno ativo
  const [notasPorCaderno, setNotasPorCaderno] = useState({})

  // Vault index: Map<string, metadata> — construído uma vez, atualizado após saves
  // Usamos ref para não causar re-render ao atualizar o índice.
  const vaultIndexRef = useRef(new Map())
  const indexBuilding = useRef(false)

  // Tabs
  const [tabs, setTabs]             = useState([novoTab('')])
  const [tabAtivaIdx, setTabAtivaIdx] = useState(0)

  // navKey: incrementado a cada navegação → garante remount do editor
  const [navKey, setNavKey] = useState(0)

  const saveTimer     = useRef(null)
  const editorRef     = useRef(null)
  const cmViewRef     = useRef(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const { width: sidebarWidth, collapsed: sidebarCollapsed, toggleCollapsed: toggleSidebar, onResizeStart: onSidebarResize } = useSidebarResize()
  const notaAtivaRef  = useRef(null) // sempre a versão mais recente da nota ativa (síncrono, sem aguardar re-render)
  const foiEditadaRef = useRef(false) // true quando o usuário editou o conteúdo desde que abriu a nota
  const [showTemplates, setShowTemplates] = useState(false)

  // Status do autosave: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveStatusTimer = useRef(null)

  // Derived
  const tabAtiva    = tabs[tabAtivaIdx] ?? tabs[0]
  const notaAtiva   = tabAtiva?.nota    ?? null
  const cadernoAtivo = tabAtiva?.caderno ?? ''
  const canGoBack    = !!tabAtiva && tabAtiva.histIdx > 0
  const canGoForward = !!tabAtiva && tabAtiva.histIdx < tabAtiva.history.length - 1

  // ── Vault Index ─────────────────────────────────────────────────────────────

  /**
   * Constrói o índice plano do vault — metadata only, sem parsing de conteúdo.
   * getTodasNotasMetadata() usa readdirRecursive e lê apenas o frontmatter.
   * Indexa por titulo normalizado E por _filename, para cobrir:
   *  - [[Nota com acentos]] (titulo)
   *  - [[nota-com-acentos]] (filename stem)
   */
  async function buildVaultIndex() {
    if (indexBuilding.current) return vaultIndexRef.current
    indexBuilding.current = true
    try {
      // getTodasNotasMetadata() já retorna ordenado por editadaEm desc —
      // ao processar do mais recente para o mais antigo, o mais recente
      // fica no índice quando há títulos duplicados.
      const metadata = await getTodasNotasMetadata()
      const map = new Map()
      for (const nota of metadata) {
        const titleKey = nota.titulo?.normalize('NFC').toLowerCase()
        const fnKey    = nota._filename?.normalize('NFC').toLowerCase()
        // Título: só indexa se a chave ainda não existe (mais recente tem prioridade)
        if (titleKey && !map.has(titleKey)) map.set(titleKey, nota)
        // Filename: sempre indexa (filename é único por definição)
        if (fnKey && fnKey !== titleKey) map.set(fnKey, nota)
      }
      vaultIndexRef.current = map
      return map
    } catch (err) {
      console.warn('[VaultIndex] Falha ao construir índice:', err?.message)
      return vaultIndexRef.current
    } finally {
      indexBuilding.current = false
    }
  }

  // Constrói o índice ao montar e ao trocar vault
  useEffect(() => { buildVaultIndex() }, [vaultPath])

  // Flush do autosave ao fechar/encerrar o app.
  // Usa notaAtivaRef (ref síncrono) em vez de notaAtiva (state React assíncrono).
  // Motivo: setTabs() em atualizarNotaAtiva não atualiza o state React antes do
  // próximo render — se beforeunload disparar antes do render, notaAtiva estaria
  // stale e o conteúdo editado seria perdido.
  useEffect(() => {
    function flushSave() {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      const nota = notaAtivaRef.current // sempre tem a versão mais recente
      if (nota) salvarNota(nota).catch(e => console.error('[Flush save]', e))
    }
    window.addEventListener('beforeunload', flushSave)
    return () => {
      window.removeEventListener('beforeunload', flushSave)
      // Flush ao desmontar (troca de aba) — sem isso, o debounce pendente é perdido
      flushSave()
      // Limpa timer de status para evitar setState em componente desmontado
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
    }
  }, []) // deps vazio: registra uma vez, sempre lê do ref

  // Invalida índice após save de nota disparando rebuild em background.
  // NÃO limpa o mapa — getSuggestions() ficaria com itens vazios durante o rebuild
  // (700ms de lacuna) e o dropdown de autocomplete desapareceria permanentemente.
  function invalidateIndex() {
    buildVaultIndex() // non-blocking: atualiza vaultIndexRef.current quando terminar
  }

  // ── getSuggestions — autocomplete [[wikilink]] ───────────────────────────────
  //
  // Chamada pelo WikiLinkExtension com o texto digitado após "[[".
  // Retorna até 8 notas que contenham `query` no título, priorizando
  // matches de prefixo e notas mais recentes.
  // Usa o vault index em memória (O(n) onde n = total de notas), sem I/O.

  function getSuggestions(query) {
    const q = (query || '').normalize('NFC').toLowerCase().trim()
    const seen = new Set()
    const results = []

    for (const meta of vaultIndexRef.current.values()) {
      if (!meta.titulo) continue
      const key = meta.titulo.normalize('NFC').toLowerCase()
      if (seen.has(key)) continue   // deduplica (titulo + filename podem apontar para a mesma nota)
      seen.add(key)

      if (!q || key.includes(q)) {
        results.push({
          titulo:    meta.titulo,
          caderno:   meta.caderno || '',
          subpasta:  meta.subpasta || '',
          editadaEm: meta.editadaEm || 0,
          prefixo:   key.startsWith(q),
        })
      }
    }

    // Ordena: prefixo exato primeiro, depois mais recentes
    results.sort((a, b) => {
      if (a.prefixo !== b.prefixo) return a.prefixo ? -1 : 1
      return b.editadaEm - a.editadaEm
    })

    return results.slice(0, 8)
  }

  // ── Tab mutation helpers ─────────────────────────────────────────────────────

  function mutarTab(updater) {
    setTabs(prev => {
      const next    = [...prev]
      const patches = updater(next[tabAtivaIdx])
      if (!patches || Object.keys(patches).length === 0) return prev
      next[tabAtivaIdx] = { ...next[tabAtivaIdx], ...patches }
      return next
    })
  }

  function navigarPara(nota, caderno) {
    if (!nota) return
    const targetCaderno = caderno ?? nota?.caderno ?? cadernoAtivo
    foiEditadaRef.current = false
    notaAtivaRef.current = nota
    setNavKey(k => k + 1)
    mutarTab(tab => {
      const novoHistory = [...tab.history.slice(0, tab.histIdx + 1), nota.id]
      return { nota, caderno: targetCaderno, history: novoHistory, histIdx: novoHistory.length - 1 }
    })
  }

  function atualizarNotaNoTab(nota) {
    mutarTab(() => ({ nota }))
  }

  // ── Notifica nota ativa para outros componentes (GraphTab) ──────────────────
  useEffect(() => { onNotaAtiva?.(notaAtiva?.id ?? null) }, [notaAtiva?.id]) // eslint-disable-line

  // ── Backlinks (lazy, calculados ao abrir nota) ───────────────────────────────

  useEffect(() => {
    if (!notaAtiva?.titulo) { setBacklinks([]); return }
    let cancelled = false
    getBacklinks(notaAtiva.titulo)
      .then(bls => {
        if (!cancelled) {
          // Exclui a própria nota dos backlinks
          setBacklinks(bls.filter(b => b._filename !== notaAtiva._filename && b.id !== notaAtiva.id))
        }
      })
      .catch(() => { if (!cancelled) setBacklinks([]) })
    return () => { cancelled = true }
  }, [notaAtiva?.id, notaAtiva?.titulo, notaAtiva?._filename]) // eslint-disable-line

  // ── Back / Forward ──────────────────────────────────────────────────────────

  async function goBack() {
    const tabSnapshot = tabAtivaIdx
    const tab = tabs[tabSnapshot]
    if (!tab || tab.histIdx <= 0) return
    const novoIdx = tab.histIdx - 1
    const notaId = tab.history[novoIdx]
    // Busca na lista atual, senão busca no vault
    let nota = notas.find(n => n.id === notaId)
    if (!nota) {
      // Nota pode estar em outro caderno — busca via vault index
      for (const meta of vaultIndexRef.current.values()) {
        if (meta.id === notaId) {
          const lista = await getNotasPorCaderno(meta.caderno)
          if (tabAtivaIdx !== tabSnapshot) return // aba mudou durante await
          setNotas(lista)
          nota = lista.find(n => n.id === notaId)
          break
        }
      }
    }
    if (!nota || tabAtivaIdx !== tabSnapshot) return
    foiEditadaRef.current = false
    notaAtivaRef.current = nota
    setNavKey(k => k + 1)
    setTabs(prev => prev.map((t, i) => i === tabSnapshot ? { ...t, nota, caderno: nota.caderno || t.caderno, histIdx: novoIdx } : t))
  }

  async function goForward() {
    const tabSnapshot = tabAtivaIdx
    const tab = tabs[tabSnapshot]
    if (!tab || tab.histIdx >= tab.history.length - 1) return
    const novoIdx = tab.histIdx + 1
    const notaId = tab.history[novoIdx]
    let nota = notas.find(n => n.id === notaId)
    if (!nota) {
      for (const meta of vaultIndexRef.current.values()) {
        if (meta.id === notaId) {
          const lista = await getNotasPorCaderno(meta.caderno)
          if (tabAtivaIdx !== tabSnapshot) return // aba mudou durante await
          setNotas(lista)
          nota = lista.find(n => n.id === notaId)
          break
        }
      }
    }
    if (!nota || tabAtivaIdx !== tabSnapshot) return
    foiEditadaRef.current = false
    notaAtivaRef.current = nota
    setNavKey(k => k + 1)
    setTabs(prev => prev.map((t, i) => i === tabSnapshot ? { ...t, nota, caderno: nota.caderno || t.caderno, histIdx: novoIdx } : t))
  }

  // ── Tab management ──────────────────────────────────────────────────────────

  function addTab() {
    const newIdx = tabs.length
    setTabs(prev => [...prev, novoTab(cadernoAtivo)])
    setTabAtivaIdx(newIdx)
  }

  function closeTab(e, idx) {
    e.stopPropagation()
    if (tabs.length === 1) return
    if (idx === tabAtivaIdx && saveTimer.current) {
      clearTimeout(saveTimer.current)
      const nota = notaAtivaRef.current || notaAtiva
      if (nota) salvarNota(nota)
      saveTimer.current = null
    }
    setTabs(prev => prev.filter((_, i) => i !== idx))
    setTabAtivaIdx(prev => {
      if (prev === idx)  return Math.max(0, idx - 1)
      if (prev > idx)    return prev - 1
      return prev
    })
  }

  async function switchTab(idx) {
    if (idx === tabAtivaIdx) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const nota = notaAtivaRef.current || notaAtiva
      if (nota) await salvarNota(nota)
      saveTimer.current = null
    }
    setTabAtivaIdx(idx)
  }

  // ── Load cadernos on vault change ────────────────────────────────────────────

  useEffect(() => {
    getCadernos().then(lista => {
      setCadernos(lista)
      if (lista.length > 0) {
        setTabs(prev => {
          if (prev[0].caderno) return prev
          const next = [...prev]
          next[0] = { ...next[0], caderno: lista[0].nome }
          return next
        })
      }
    })
  }, [vaultPath])

  // ── Load notas when cadernoAtivo changes ─────────────────────────────────────

  useEffect(() => {
    if (!cadernoAtivo) return
    getNotasPorCaderno(cadernoAtivo)
      .then(lista => {
        setNotas(lista)
        // Não auto-seleciona a primeira nota — usuário escolhe qual abrir
      })
      .catch(() => setNotas([]))
  }, [cadernoAtivo, vaultPath]) // eslint-disable-line

  // Carrega notas de um caderno SEM mudar o caderno ativo (para expandir na sidebar)
  async function carregarCaderno(nome) {
    if (notasPorCaderno[nome]) return
    try {
      const lista = await getNotasPorCaderno(nome)
      setNotasPorCaderno(prev => ({ ...prev, [nome]: lista }))
    } catch {}
  }

  // Atualiza cache quando caderno ativo carrega
  // (mantém notasPorCaderno sincronizado com notas do caderno ativo)
  // eslint-disable-next-line
  useEffect(() => {
    if (cadernoAtivo && notas.length > 0) {
      setNotasPorCaderno(prev => ({ ...prev, [cadernoAtivo]: notas }))
    }
  }, [notas, cadernoAtivo])

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async function novaNota(tituloInicial, cadernoDestino) {
    const caderno = cadernoDestino || cadernoAtivo
    const nota    = criarNotaVazia(caderno)
    // Gera nome único para evitar duplicatas
    const nomeBase = tituloInicial || nota.titulo
    const lista = await getNotasPorCaderno(caderno)
    const nomesExistentes = lista.map(n => n.titulo)
    if (nomesExistentes.includes(nomeBase)) {
      let i = 2
      while (nomesExistentes.includes(`${nomeBase} ${i}`)) i++
      nota.titulo = `${nomeBase} ${i}`
    } else {
      nota.titulo = nomeBase
    }
    await salvarNota(nota)
    invalidateIndex()
    const listaAtualizada = await getNotasPorCaderno(caderno)
    setNotas(listaAtualizada)
    navigarPara(nota, caderno)
    return nota
  }

  async function novoCaderno(nome) {
    await criarCaderno(nome)
    const lista = await getCadernos()
    setCadernos(lista)
    mutarTab(() => ({ caderno: nome, nota: null }))
  }

  async function deletarCaderno(id, nome) {
    if (!confirm(`Remover o caderno "${nome}" e todas as suas notas?`)) return
    await deletarCadernoDB(id, nome)
    invalidateIndex()
    const lista = await getCadernos()
    setCadernos(lista)
    if (lista.length > 0) mutarTab(() => ({ caderno: lista[0].nome, nota: null }))
    else                  mutarTab(() => ({ caderno: '', nota: null }))
  }

  async function deletar(id) {
    await deletarNota(id)
    invalidateIndex()
    const lista = await getNotasPorCaderno(cadernoAtivo)
    setNotas(lista)
    if (notaAtiva?.id === id) {
      const prox = lista.length > 0 ? lista[0] : null
      if (prox) navigarPara(prox, cadernoAtivo)
      else      mutarTab(() => ({ nota: null }))
    }
  }

  function atualizarNotaAtiva(campos) {
    // Usa notaAtivaRef (síncrono) em vez de notaAtiva (React state, pode ser stale).
    // Isso evita que _rawMarkdown reaparece via spread de um state antigo.
    const base = notaAtivaRef.current || notaAtiva
    if (!base) return
    const atualizada = { ...base, ...campos }
    // CodeMirror: _rawMarkdown É o conteúdo — nunca deletar.
    // Legado TipTap: se conteudo é objeto JSON, deleta _rawMarkdown.
    if (campos.conteudo && typeof campos.conteudo === 'object' && campos.conteudo?.type === 'doc') {
      delete atualizada._rawMarkdown
      foiEditadaRef.current = true
    }
    // Atualiza ref ANTES do setTabs (síncrono) para que beforeunload e
    // closeTab/switchTab sempre tenham acesso à versão mais recente da nota.
    notaAtivaRef.current = atualizada
    atualizarNotaNoTab(atualizada)
    setNotas(prev => prev.map(n => n.id === atualizada.id ? atualizada : n))
    setSaveStatus('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // Não agenda save se a nota não foi editada E só abriu sem tocar
    // (evita round-trip lossy em templates). Permite save de titulo/tags.
    if (!foiEditadaRef.current && !campos.titulo && !campos.tags && atualizada._rawMarkdown !== undefined) return
    saveTimer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await salvarNota(atualizada)
        invalidateIndex() // após salvar, invalida índice para próximo acesso reindexar
        setSaveStatus('saved')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (err) {
        console.error('[Autosave] Falha ao salvar nota:', err)
        setSaveStatus('error')
        if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current)
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 4000)
      }
    }, 700)
  }

  function trocarNota(nota) {
    if (nota.id === notaAtiva?.id) return // já está aberta
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      const anterior = notaAtivaRef.current || notaAtiva
      if (anterior) salvarNota(anterior)
      saveTimer.current = null
    }
    notaAtivaRef.current = nota
    navigarPara(nota, nota.caderno || cadernoAtivo)
  }

  // ── Mover nota entre cadernos (drag & drop) ──────────────────────────────────

  async function handleMoverNota(nota, novoCaderno) {
    if (!nota) { console.error('[handleMoverNota] nota é undefined'); return }
    if (!novoCaderno) { console.error('[handleMoverNota] novoCaderno é undefined'); return }
    if (nota.caderno === novoCaderno) { console.debug('[handleMoverNota] mesmo caderno, ignorando'); return }

    const cadernoOrigem = nota.caderno
    console.debug('[handleMoverNota] iniciando:', { titulo: nota.titulo, de: cadernoOrigem, para: novoCaderno, _filename: nota._filename, subpasta: nota.subpasta })

    try {
      // 1. Espera o move no filesystem terminar completamente
      await moverNota(nota, novoCaderno)

      // 2. Remove da lista ativa (se estiver nela)
      setNotas(prev => prev.filter(n => n.id !== nota.id))

      // 3. Invalida cache de ambos os cadernos APÓS o move ter sucesso
      setNotasPorCaderno(prev => {
        const next = { ...prev }
        delete next[cadernoOrigem]
        delete next[novoCaderno]
        return next
      })

      // 4. Força reload das pastas que estavam expandidas/ativas
      const reloads = []
      reloads.push(
        getNotasPorCaderno(cadernoOrigem)
          .then(lista => setNotasPorCaderno(prev => ({ ...prev, [cadernoOrigem]: lista })))
          .catch(() => {})
      )
      reloads.push(
        getNotasPorCaderno(novoCaderno)
          .then(lista => setNotasPorCaderno(prev => ({ ...prev, [novoCaderno]: lista })))
          .catch(() => {})
      )
      await Promise.all(reloads)

      // 5. Se a nota movida estava ativa, navega para ela no novo caderno
      if (notaAtiva?.id === nota.id) {
        const lista = await getNotasPorCaderno(novoCaderno)
        setNotas(lista)
        const completa = lista.find(n => n.id === nota.id)
        if (completa) navigarPara(completa, novoCaderno)
      }

      invalidateIndex()
    } catch (e) {
      console.error('[handleMoverNota] falhou:', e)
    }
  }

  // ── Ações do menu ··· ────────────────────────────────────────────────────────

  async function handleMenuRename(novoTitulo) {
    if (!notaAtiva || !vaultPath || novoTitulo === notaAtiva.titulo) return

    const oldFilename = notaAtiva._filename || notaAtiva.titulo || ''
    const novoFilename = (novoTitulo || 'sem-titulo').replace(/[/\\:*?"<>|]/g, '-').trim() || 'sem-titulo'
    const caderno = notaAtiva.caderno || ''
    const subpasta = notaAtiva.subpasta

    // Constrói paths
    const oldPath = subpasta
      ? await window.electron.joinPath(vaultPath, caderno, subpasta, oldFilename + '.md')
      : await window.electron.joinPath(vaultPath, caderno, oldFilename + '.md')
    const newPath = subpasta
      ? await window.electron.joinPath(vaultPath, caderno, subpasta, novoFilename + '.md')
      : await window.electron.joinPath(vaultPath, caderno, novoFilename + '.md')

    try {
      // Renomeia arquivo no disco
      if (oldPath !== newPath) {
        await window.electron.rename(oldPath, newPath)
      }
      // Atualiza estado com novo título e filename
      atualizarNotaAtiva({ titulo: novoTitulo, _filename: novoFilename })
      foiEditadaRef.current = true
      // Recarrega lista e índice
      const lista = await getNotasPorCaderno(cadernoAtivo)
      setNotas(lista)
      invalidateIndex()
      console.debug('[handleMenuRename] renomeado:', oldFilename, '→', novoFilename)
    } catch (err) {
      console.error('[handleMenuRename] erro:', err)
    }
  }

  async function handleMenuMove(novoCaderno) {
    if (!notaAtiva) return
    await handleMoverNota(notaAtiva, novoCaderno)
  }

  async function handleMenuDelete() {
    if (!notaAtiva) return
    await deletar(notaAtiva.id)
  }

  async function handleMenuOpenExternal() {
    if (!notaAtiva || !vaultPath) return
    const filename = notaAtiva._filename || notaAtiva.titulo || ''
    const caderno = notaAtiva.caderno || ''
    const filePath = await window.electron.joinPath(vaultPath, caderno, filename + '.md')
    window.electron.openPath(filePath)
  }

  // ── Wikilink click — O(1) via vault index ────────────────────────────────────
  //
  // Fluxo Obsidian-style:
  //   1. Extrai título (ignora alias após |)
  //   2. Lookup no índice em memória
  //   3. Se não encontrado, reconstrói índice e tenta de novo
  //   4. Carrega caderno da nota encontrada, navega
  //   5. Se não existe → cria nova nota com esse título

  async function handleWikiLinkClick(tituloRaw) {
    const titulo = tituloRaw.split('|')[0].trim()
    const key    = titulo.normalize('NFC').toLowerCase()

    // 1. Salva nota atual de forma não-fatal
    if (notaAtiva && saveTimer.current) {
      clearTimeout(saveTimer.current)
      try { await salvarNota(notaAtiva) } catch (err) {
        console.warn('[Wikilink] Falha ao salvar nota atual:', err?.message)
      }
      saveTimer.current = null
    }

    // 2. Tenta índice em memória
    let meta = vaultIndexRef.current.get(key)

    // 3. Índice vazio ou stale → reconstrói
    if (!meta) {
      const freshIndex = await buildVaultIndex()
      meta = freshIndex.get(key)
    }

    if (meta) {
      const targetCaderno = meta.caderno || cadernoAtivo

      // 4a. Carrega a lista do caderno alvo (pode ser diferente do atual)
      let lista = notas
      if (targetCaderno !== cadernoAtivo) {
        lista = await getNotasPorCaderno(targetCaderno)
        setNotas(lista)
      }

      // 4b. Encontra a nota completa na lista (com conteúdo)
      const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
      let completa = lista.find(n =>
        n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
      )

      // 4c. Fallback: recarrega caderno (nota pode não estar carregada ainda)
      if (!completa) {
        const lista2 = await getNotasPorCaderno(targetCaderno)
        setNotas(lista2)
        completa = lista2.find(n =>
          n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
        )
      }

      if (completa) {
        console.log(`[Wikilink] ✓ "${titulo}" → "${completa.titulo}" (${targetCaderno})`)
        navigarPara(completa, targetCaderno)
        return
      }

      console.warn(`[Wikilink] ✗ Metadata encontrada no índice mas nota não carregada: "${titulo}"`)
    } else {
      console.warn(`[Wikilink] ✗ "${titulo}" não encontrada no índice (${vaultIndexRef.current.size} entradas)`)
    }

    // 5. Não existe → cria nova nota com esse título
    // Flush save pendente antes de criar nova nota
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      try { await salvarNota(notaAtivaRef.current) } catch {}
    }
    await novaNota(titulo)
  }

  // ── Templates (Cmd+T) ────────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        if (notaAtiva) setShowTemplates(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notaAtiva])

  function inserirTemplate(markdownPuro) {
    if (!editorRef.current) return
    editorRef.current.insertMarkdown(markdownPuro)
    foiEditadaRef.current = true
    setShowTemplates(false)
  }

  // ── Journal entry (nota diária) ───────────────────────────────────────────────

  const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  const DIAS_PT  = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']

  async function criarNotaDiaria() {
    const now   = new Date()
    const dia   = now.getDate()
    const mes   = MESES_PT[now.getMonth()]
    const ano   = now.getFullYear()
    const diaSem = DIAS_PT[now.getDay()]
    const titulo = `${dia} ${mes} ${ano}`

    // Caderno destino: config journalCaderno → caderno ativo → primeiro caderno
    const journalCaderno = (await window.electron?.getConfig('journalCaderno')) || cadernoAtivo || cadernos[0]?.nome
    const cadernoDestino = journalCaderno || cadernoAtivo

    // Verifica se a nota do dia já existe
    const key = titulo.normalize('NFC').toLowerCase()
    let meta = vaultIndexRef.current.get(key)
    if (!meta) {
      const fresh = await buildVaultIndex()
      meta = fresh.get(key)
    }

    if (meta) {
      // Nota do dia já existe → navega para ela
      const targetCaderno = meta.caderno || cadernoDestino
      if (targetCaderno !== cadernoAtivo) {
        mutarTab(() => ({ caderno: targetCaderno }))
      }
      const lista = await getNotasPorCaderno(targetCaderno)
      setNotas(lista)
      const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
      const completa = lista.find(n =>
        n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
      )
      if (completa) {
        navigarPara(completa, targetCaderno)
        return
      }
    }

    // Nota não existe → cria nova com título da data e header de diário
    if (cadernoDestino !== cadernoAtivo) {
      mutarTab(() => ({ caderno: cadernoDestino }))
    }
    const nota = criarNotaVazia(cadernoDestino)
    nota.titulo = titulo
    // Conteúdo inicial: header com dia da semana
    nota.conteudo = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `${diaSem}, ${dia} de ${mes} de ${ano}` }] },
        { type: 'paragraph' },
      ],
    }
    await salvarNota(nota)
    invalidateIndex()
    const lista = await getNotasPorCaderno(cadernoDestino)
    setNotas(lista)
    navigarPara(nota, cadernoDestino)
  }

  // ── Global events ────────────────────────────────────────────────────────────

  // paraverso:journal (botão ou atalho)
  useEffect(() => {
    window.addEventListener('paraverso:journal', criarNotaDiaria)
    return () => window.removeEventListener('paraverso:journal', criarNotaDiaria)
  }, [cadernoAtivo, cadernos]) // eslint-disable-line

  // paraverso:nova-nota (Cmd+N)
  useEffect(() => {
    async function handleNovaNota() {
      const defaultCaderno = (await window.electron?.getConfig('defaultCaderno')) || cadernoAtivo || cadernos[0]?.nome
      const cadernoDestino  = defaultCaderno || cadernoAtivo
      if (cadernoDestino && cadernoDestino !== cadernoAtivo) {
        mutarTab(() => ({ caderno: cadernoDestino }))
      }
      await novaNota(undefined, cadernoDestino)
    }
    window.addEventListener('paraverso:nova-nota', handleNovaNota)
    return () => window.removeEventListener('paraverso:nova-nota', handleNovaNota)
  }, [cadernoAtivo, cadernos]) // eslint-disable-line

  // paraverso:criar-nota (criação de nota a partir de outros módulos)
  useEffect(() => {
    async function handleCriarNota(e) {
      const { titulo, caderno: cadernoAlvo } = e.detail
      // Verifica no índice se já existe
      const key = titulo.normalize('NFC').toLowerCase()
      let meta = vaultIndexRef.current.get(key)
      if (!meta) {
        const fresh = await buildVaultIndex()
        meta = fresh.get(key)
      }
      if (meta) return // já existe

      const cadernoDestino = cadernoAlvo || cadernoAtivo
      const notaNova = criarNotaVazia(cadernoDestino)
      notaNova.titulo = titulo
      await salvarNota(notaNova)
      invalidateIndex()

      if (cadernoDestino === cadernoAtivo) {
        const lista = await getNotasPorCaderno(cadernoAtivo)
        setNotas(lista)
      }
    }
    window.addEventListener('paraverso:criar-nota', handleCriarNota)
    return () => window.removeEventListener('paraverso:criar-nota', handleCriarNota)
  }, [cadernoAtivo]) // eslint-disable-line

  // ── Nota pendente (QuickSwitcher) ─────────────────────────────────────────
  //
  // QuickSwitcher passa metadata-only (sem conteudo).
  // QuickSwitcher passa nota completa.
  // Aqui garantimos que o conteúdo seja carregado antes de navegar.

  useEffect(() => {
    if (!notaPendente) return
    let cancelled = false

    async function abrirNota() {
      let nota = notaPendente

      // ── Criar nota nova (QuickSwitcher: _criar: true) ──────────────────────
      if (nota._criar && nota.titulo) {
        if (cancelled) return
        // Verifica no índice se já existe — se sim, navega; se não, cria
        const key = nota.titulo.normalize('NFC').toLowerCase()
        let meta = vaultIndexRef.current.get(key)
        if (!meta) {
          const fresh = await buildVaultIndex()
          meta = fresh.get(key)
        }
        if (meta) {
          // Nota já existe → navega para ela
          const targetCaderno = meta.caderno || cadernoAtivo
          const lista = await getNotasPorCaderno(targetCaderno)
          if (!cancelled) setNotas(lista)
          const fnNorm = meta._filename?.normalize('NFC').toLowerCase()
          const completa = lista.find(n =>
            n._filename?.normalize('NFC').toLowerCase() === fnNorm || n.id === meta.id
          )
          if (!cancelled && completa) {
            navigarPara(completa, targetCaderno)
            onNotaAberta?.()
          }
        } else {
          // Nota não existe → cria nova
          if (!cancelled) {
            await novaNota(nota.titulo)
            onNotaAberta?.()
          }
        }
        return
      }

      // ── Abrir nota existente (QuickSwitcher / link normal) ─────────────────
      if (!nota.conteudo) {
        // Nota sem conteúdo (QuickSwitcher) — carrega do caderno
        try {
          const targetCaderno = nota.caderno || cadernoAtivo
          const lista = await getNotasPorCaderno(targetCaderno)
          if (!cancelled) setNotas(lista)
          const completa = lista.find(n =>
            n._filename === nota._filename || n.id === nota.id
          )
          if (completa) nota = completa
        } catch { /* continua com metadata-only se falhar */ }
      }

      if (!cancelled) {
        navigarPara(nota, nota.caderno || cadernoAtivo)
        onNotaAberta?.()
      }
    }

    abrirNota()
    return () => { cancelled = true }
  }, [notaPendente]) // eslint-disable-line

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex overflow-hidden bg-bg dark:bg-bg-dark">

      {showTemplates && (
        <TemplateModal
          onInsert={inserirTemplate}
          onClose={() => setShowTemplates(false)}
          titulo={notaAtiva?.titulo}
        />
      )}

      {/* Sidebar */}
      <NotesSidebar
        cadernos={cadernos}
        notas={notas}
        caderno={cadernoAtivo}
        setCaderno={c => mutarTab(() => ({ caderno: c, nota: null }))}
        notaSelecionada={notaAtiva}
        setNotaSelecionada={trocarNota}
        onNovaNota={() => novaNota()}
        onNovoCaderno={novoCaderno}
        onDeletarCaderno={deletarCaderno}
        onDeletarNota={deletar}
        onMoverNota={handleMoverNota}
        notasPorCaderno={notasPorCaderno}
        onCarregarCaderno={carregarCaderno}
        width={sidebarWidth}
        collapsed={sidebarCollapsed}
        toggleCollapsed={toggleSidebar}
        onResizeStart={onSidebarResize}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-bg dark:bg-bg-dark">
        {/* Barra de navegação — transparente, flutuando sobre o editor */}
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

          {/* Breadcrumb — centralizado */}
          {notaAtiva && (
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
              <span style={{ fontSize: '11px', color: '#4a4a4a', userSelect: 'none' }}>
                {notaAtiva.caderno && <>{notaAtiva.caderno}{notaAtiva.subpasta ? ` / ${notaAtiva.subpasta}` : ''}  /  </>}
                {notaAtiva.titulo}
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
              nota={notaAtiva}
              cadernos={cadernos}
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
                color: outlineOpen ? '#e8a44a' : '#3d3d3a',
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

        {/* Editor + Outline */}
        {notaAtiva ? (
          <div className="flex-1 flex min-w-0 overflow-hidden">
            <NoteEditorCM
              key={navKey}
              nota={notaAtiva}
              textura={textura}
              editorRef={editorRef}
              cmViewRef={cmViewRef}
              backlinks={backlinks}
              getSuggestions={getSuggestions}
              onTituloChange={titulo => atualizarNotaAtiva({ titulo })}
              onConteudoChange={markdown => {
                foiEditadaRef.current = true
                atualizarNotaAtiva({ _rawMarkdown: markdown, conteudo: null })
              }}
              onWikiLinkClick={handleWikiLinkClick}
            />
            <OutlinePanel cmViewRef={cmViewRef} isOpen={outlineOpen} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-ink-3 dark:text-ink-dark3 text-sm">Nenhuma nota selecionada</p>
            <div className="flex gap-2">
              <button
                onClick={() => novaNota()}
                className="text-sm text-accent dark:text-accent-dark border border-accent/30 dark:border-accent-dark/30 rounded-lg px-4 py-2 hover:bg-accent/5 dark:hover:bg-accent-dark/5 transition-colors"
              >
                + Nova nota
              </button>
              <button
                onClick={criarNotaDiaria}
                className="text-sm text-accent dark:text-accent-dark border border-accent/30 dark:border-accent-dark/30 rounded-lg px-4 py-2 hover:bg-accent/5 dark:hover:bg-accent-dark/5 transition-colors flex items-center gap-1.5"
              >
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
