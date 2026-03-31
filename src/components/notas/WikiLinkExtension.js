/**
 * WikiLinkExtension.js — Decoration approach (Obsidian-style)
 *
 * Comportamento:
 *  1. Wikilinks são TEXTO PURO [[Título]] no documento ProseMirror. Sem nó especial.
 *
 *  2. Decoration: quando cursor NÃO está dentro de [[...]], o plugin aplica
 *     um inline decoration que estiliza o span como link clicável colorido.
 *     Quando cursor ENTRA em [[...]], a decoration some → texto raw aparece
 *     para edição — exatamente como Obsidian Live Preview.
 *
 *  3. Click simples → navega. Detecção via view.posAtCoords + regex no doc.
 *     handleMouseDown recebe (view, event) — NÃO (view, pos, event).
 *
 *  4. Auto-close: digitar o 2º `[` insere `[]]` e posiciona cursor entre [[|]].
 *
 *  5. Backspace inteligente:
 *     - Cursor entre [[ e ]] → apaga os 4 chars juntos ([[]])
 *     - Cursor imediatamente após ]] completo → apaga o link inteiro
 *
 *  6. Autocomplete: detecta [[query]] SÓ quando cursor está no FINAL do
 *     conteúdo (antes de ]] ou sem ]] ainda). Cursor no meio → sem dropdown.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ── Regex ────────────────────────────────────────────────────────────────────
const wikilinkRe = /\[\[([^\]]+)\]\]/g

// ── Plugin keys ──────────────────────────────────────────────────────────────
const decoKey = new PluginKey('wikilink-deco')
const suggKey = new PluginKey('wikilink-sugg')

// ── getSuggMatch ─────────────────────────────────────────────────────────────
// Retorna match do [[query antes do cursor, ou null.
// Só ativa quando cursor está no FINAL do conteúdo dentro dos colchetes:
//   [[texto|]]  → ativa (cursor antes de ]])
//   [[|]]       → ativa (cursor entre [[ e ]])
//   [[te|xto]]  → NÃO ativa (cursor no meio)
//   [[texto     → ativa (sem fechar, ainda digitando)
function getSuggMatch(state) {
  const { $from, empty } = state.selection
  if (!empty) return null

  const parentText   = $from.parent.textContent
  const parentOffset = $from.parentOffset
  const textBefore   = parentText.slice(0, parentOffset)

  // Localiza [[query aberto (sem ] até o cursor)
  const match = textBefore.match(/\[\[([^\]]*)$/)
  if (!match) return null

  const query     = match[1]
  const nodeStart = $from.pos - parentOffset
  const rangeFrom = nodeStart + textBefore.length - match[0].length

  // Texto após o cursor no mesmo parágrafo
  const textAfter = parentText.slice(parentOffset)

  // Verifica posição do cursor relativa ao ]]
  // Só mostra autocomplete se cursor está no FINAL do conteúdo
  if (textAfter.startsWith(']]')) {
    // Cursor logo antes de ]] → no final do conteúdo → OK
  } else if (textAfter.indexOf(']]') === -1) {
    // Sem ]] → ainda digitando (sem fechar) → OK
  } else {
    // Há texto entre cursor e ]] → cursor no MEIO → NÃO mostrar
    return null
  }

  // Calcula rangeTo: procura ]] no texto do parágrafo a partir de [[
  const textFromOpen = parentText.slice(textBefore.length - match[0].length)
  const closingIdx   = textFromOpen.indexOf(']]')
  const rangeTo = closingIdx !== -1
    ? nodeStart + (textBefore.length - match[0].length) + closingIdx + 2
    : $from.pos

  return { query, rangeFrom, rangeTo, cursorPos: $from.pos }
}

// ── buildDecorations ─────────────────────────────────────────────────────────
function buildDecorations(doc, selFrom) {
  const decos = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'text') return
    if (!node.text?.includes('[[')) return

    wikilinkRe.lastIndex = 0
    let m
    while ((m = wikilinkRe.exec(node.text)) !== null) {
      const from   = pos + m.index
      const to     = from + m[0].length
      const titulo = m[1].trim()

      // Cursor dentro → não decora (mostra texto raw para edição)
      if (selFrom > from && selFrom <= to) continue

      decos.push(
        Decoration.inline(from, to, {
          class:           'wikilink',
          'data-wikilink': '',
          'data-titulo':   titulo,
        })
      )
    }
  })

  return DecorationSet.create(doc, decos)
}

// ── Encontra wikilink na posição do doc ───────────────────────────────────────
function findWikilinkAtPos(doc, pos) {
  let found = null
  doc.descendants((node, nodePos) => {
    if (found) return false
    if (node.type.name !== 'text' || !node.text?.includes('[[')) return
    wikilinkRe.lastIndex = 0
    let m
    while ((m = wikilinkRe.exec(node.text)) !== null) {
      const from = nodePos + m.index
      const to   = from + m[0].length
      if (pos >= from && pos < to) {
        found = { titulo: m[1].trim(), from, to }
        return false
      }
    }
  })
  return found
}

// ── Extension ────────────────────────────────────────────────────────────────

export const WikiLink = Extension.create({
  name: 'wikilink',

  addOptions() {
    return {
      onWikiLinkClick:     (_titulo)  => {},   // chamado ao clicar em [[link]] decorado
      getSuggestions:      (_query)   => [],
      onSuggestionStart:   (_payload) => {},
      onSuggestionUpdate:  (_payload) => {},
      onSuggestionExit:    ()         => {},
      onSuggestionKeyDown: (_payload) => false,
    }
  },

  // ── Auto-close [[ → [[|]]  +  Backspace inteligente ──────────────────────
  addKeyboardShortcuts() {
    return {
      // Digitar 2º [ → [[|]] em uma transação atômica
      '[': () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty) return false

        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
        if (!textBefore.endsWith('[')) return false
        if (textBefore.match(/\[\[([^\]]*)$/)) return false  // já dentro de [[

        const { state, dispatch } = this.editor.view
        const pos = state.selection.from
        const tr  = state.tr.insertText('[]]', pos)
        tr.setSelection(TextSelection.create(tr.doc, pos + 1))
        dispatch(tr)
        return true
      },

      // Backspace: apaga [[]] juntos quando cursor está entre [[ e ]]
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty) return false

        const parentText = $from.parent.textContent
        const off        = $from.parentOffset
        const before     = parentText.slice(0, off)
        const after      = parentText.slice(off)

        // Caso 1: cursor ENTRE [[ e ]] → [[|]] apaga tudo
        if (before.endsWith('[[') && after.startsWith(']]')) {
          const { state, dispatch } = this.editor.view
          const pos = state.selection.from
          const tr  = state.tr.delete(pos - 2, pos + 2)
          dispatch(tr)
          return true
        }

        // Caso 2: cursor logo após ]] → [[query]] apaga o wikilink inteiro
        if (before.endsWith(']]')) {
          const openIdx = before.lastIndexOf('[[')
          if (openIdx !== -1) {
            const { state, dispatch } = this.editor.view
            const nodeStart = $from.pos - off
            const from = nodeStart + openIdx
            const to   = $from.pos
            const tr   = state.tr.delete(from, to)
            dispatch(tr)
            return true
          }
        }

        return false
      },
    }
  },

  addProseMirrorPlugins() {
    const ext = this.options

    // Estado de sugestão — compartilhado entre view() e handleKeyDown.
    // Definido aqui (no scope de addProseMirrorPlugins) para ser acessível
    // por ambos. addProseMirrorPlugins é chamado uma vez por editor instance,
    // então é fresh por editor (não stale entre remounts como seria module-level).
    const sugg = { active: false, suppressPos: null }

    return [

      // ── 1. Decoration plugin — estiliza [[...]] e captura click ────────────
      new Plugin({
        key: decoKey,

        state: {
          init(_, state) {
            return buildDecorations(state.doc, state.selection.from)
          },
          apply(_tr, _old, _prev, newState) {
            return buildDecorations(newState.doc, newState.selection.from)
          },
        },

        props: {
          decorations(state) {
            return decoKey.getState(state)
          },
        },

        // Click handler via native DOM listener na CAPTURE phase.
        // ProseMirror's handleMouseDown e TipTap's wrappers não funcionavam.
        // Event listener nativo com { capture: true } dispara ANTES de tudo.
        // Chama ext.onWikiLinkClick DIRETAMENTE (sem CustomEvent intermediário).
        view(editorView) {
          function onMouseDown(event) {
            if (event.button !== 0) return

            // Só intercepta clicks em spans com a decoration wikilink ativa.
            // Quando cursor está DENTRO do [[link]], a decoration é removida
            // → data-wikilink não existe no DOM → click funciona normal.
            const wikilinkEl = event.target?.closest?.('[data-wikilink]')
            if (!wikilinkEl) return

            const titulo = wikilinkEl.getAttribute('data-titulo')
            if (!titulo) return

            // Bloqueia TUDO: ProseMirror, TipTap, React — ninguém vê este evento
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()

            // Chama callback direto (sem CustomEvent). O ext.onWikiLinkClick
            // é um wrapper arrow fn que sempre lê do ref mais recente.
            ext.onWikiLinkClick(titulo)
          }

          // Capture phase = dispara antes de bubble, antes de ProseMirror
          editorView.dom.addEventListener('mousedown', onMouseDown, true)

          return {
            destroy() {
              editorView.dom.removeEventListener('mousedown', onMouseDown, true)
            },
          }
        },
      }),

      // ── 2. Suggestion — autocomplete [[query ───────────────────────────────
      new Plugin({
        key: suggKey,

        view() {
          return {
            update(view) {
              const { state } = view

              // Supressão pós-Escape: mantém fechado até cursor mover
              if (sugg.suppressPos !== null) {
                if (state.selection.from !== sugg.suppressPos) {
                  sugg.suppressPos = null
                } else {
                  if (sugg.active) { ext.onSuggestionExit(); sugg.active = false }
                  return
                }
              }

              const snap = getSuggMatch(state)

              if (!snap) {
                if (sugg.active) { ext.onSuggestionExit(); sugg.active = false }
                return
              }

              const { query, rangeFrom, rangeTo, cursorPos } = snap
              const items = ext.getSuggestions(query)

              let position = { x: 100, y: 100, lineHeight: 24 }
              try {
                const coords = view.coordsAtPos(cursorPos)
                const lineH = coords.bottom - coords.top
                position = { x: coords.left, y: coords.bottom + 6, lineHeight: lineH }
              } catch {/* ignora */}

              // Executado quando usuário seleciona do dropdown
              function command({ titulo }) {
                const live = getSuggMatch(view.state)
                if (!live) return

                const wikilinkText = `[[${titulo}]]`
                const tr = view.state.tr.insertText(
                  wikilinkText + ' ',
                  live.rangeFrom,
                  live.rangeTo,
                )
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    live.rangeFrom + wikilinkText.length + 1,
                  )
                )
                // Fecha dropdown ANTES de dispatch para garantir que o React
                // limpa o componente. Sem isso, update() vê sugg.active=false
                // e pula o onSuggestionExit → dropdown fica pendurado.
                sugg.active = false
                ext.onSuggestionExit()
                view.dispatch(tr)
              }

              const payload = { items, query, position, command }

              if (!sugg.active) {
                ext.onSuggestionStart(payload)
                sugg.active = true
              } else {
                ext.onSuggestionUpdate(payload)
              }
            },

            destroy() {
              if (sugg.active) { ext.onSuggestionExit(); sugg.active = false }
            },
          }
        },

        props: {
          handleKeyDown(view, event) {
            // Agora pode acessar `sugg` diretamente (scope compartilhado)
            if (!sugg.active) return false

            if (event.key === 'Escape') {
              ext.onSuggestionExit()
              sugg.active = false
              sugg.suppressPos = view.state.selection.from
              return true
            }

            if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(event.key)) {
              return ext.onSuggestionKeyDown({ event }) || false
            }

            return false
          },
        },
      }),
    ]
  },
})
