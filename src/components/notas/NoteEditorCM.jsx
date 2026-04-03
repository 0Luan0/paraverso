import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder, ViewPlugin, Decoration, WidgetType } from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { autocompletion } from '@codemirror/autocomplete'
import { HighlightStyle, syntaxHighlighting, syntaxTree, foldService, codeFolding, foldGutter, foldKeymap } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useVault } from '../../contexts/VaultContext'
import { gerarNomeAnexo, extDeMimeType } from '../../lib/attachments'

// ── Markdown syntax highlighting ────────────────────────────────────────────
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.8em', fontWeight: '700', lineHeight: '1.3', color: '#F9A834' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '600', lineHeight: '1.4', color: '#46C0B1' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '600', color: '#e4e4e4' },
  { tag: tags.heading4, fontSize: '1.1em', fontWeight: '600', color: '#888888' },
  { tag: tags.heading5, fontSize: '1.05em', fontWeight: '600', color: '#888888' },
  { tag: tags.heading6, fontSize: '1em', fontWeight: '600', color: '#888888' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
  { tag: tags.link, color: '#E75383' },
  { tag: tags.url, color: '#a0a0a0', opacity: '0.7' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', background: 'rgba(128,128,128,0.12)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.quote, fontStyle: 'italic', opacity: '0.75' },
  { tag: tags.processingInstruction, opacity: '0.35' },
  { tag: tags.meta, opacity: '0.35' },
])

// ── Tema base (Obsidian-like) ───────────────────────────────────────────────
const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px', fontFamily: 'inherit', background: 'transparent' },
  '.cm-content': { padding: '24px 32px', caretColor: '#e4e4e4', fontFamily: 'inherit', lineHeight: '1.7', color: '#d4cfc9' },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { overflow: 'auto', height: '100%' },
  '.cm-placeholder': { color: 'rgba(128,128,128,0.5)', fontStyle: 'italic' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.02)' },
  '&.cm-focused .cm-activeLine': { background: 'rgba(255,255,255,0.03)' },
  '.cm-gutters': { background: 'transparent', border: 'none', paddingLeft: '8px' },
  '.cm-foldGutter': { width: '16px' },
  '.cm-foldGutter .cm-gutterElement': {
    cursor: 'pointer',
    color: 'rgba(232,164,74,0.5)',
    fontSize: '14px',
    lineHeight: '1.7',
    textAlign: 'center',
    transition: 'color 0.15s',
    padding: '0',
  },
  '.cm-foldGutter .cm-gutterElement:hover': { color: '#e4e4e4' },
  '.cm-foldPlaceholder': {
    background: 'rgba(212,146,74,0.1)',
    border: '1px solid rgba(212,146,74,0.25)',
    borderRadius: '3px',
    color: '#e4e4e4',
    padding: '0 6px',
    margin: '0 4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  '.cm-wikilink': { color: '#E75383', cursor: 'pointer', borderBottom: '1px solid currentColor', opacity: '0.85' },
  '.cm-wikilink:hover': { opacity: '1' },
  '.cm-hashtag': { color: '#46C0B1', opacity: '0.7' },
  '.cm-blockquote': { borderLeft: '3px solid #444', paddingLeft: '12px', color: '#a0a0a0', fontStyle: 'italic' },
  '.cm-tooltip-autocomplete': { background: '#221E16 !important', border: '1px solid #3A3428 !important', borderRadius: '8px !important', boxShadow: '0 8px 24px rgba(0,0,0,0.15) !important', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul': { maxHeight: '240px' },
  '.cm-tooltip-autocomplete ul li': { padding: '6px 12px !important', fontSize: '13px', color: '#EDE8DF' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: '#e4e4e4 !important', color: 'white !important' },
})

// ── Fold headings (Obsidian-like) ──────────────────────────────────────────
const markdownHeadingFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart)
  const match = line.text.match(/^(#{1,6})\s/)
  if (!match) return null

  const level = match[1].length
  const lastLine = state.doc.lines

  // Procura próximo heading de nível igual ou superior
  for (let i = line.number + 1; i <= lastLine; i++) {
    const nextLine = state.doc.line(i)
    const nextMatch = nextLine.text.match(/^(#{1,6})\s/)
    if (nextMatch && nextMatch[1].length <= level) {
      // Colapsa até o final da linha anterior (exclui o próximo heading)
      const endLine = state.doc.line(i - 1)
      return endLine.to > line.to ? { from: line.to, to: endLine.to } : null
    }
  }

  // Heading é o último — colapsa até o final do documento
  const docEnd = state.doc.line(lastLine).to
  return docEnd > line.to ? { from: line.to, to: docEnd } : null
})

// ── Wikilink decoration plugin ──────────────────────────────────────────────
const ATTACHMENT_EXTS = /\.(png|jpg|jpeg|gif|webp|pdf|mp4|mov|zip)$/i

const wikilinkPlugin = ViewPlugin.fromClass(class {
  decorations
  constructor(view) { this.decorations = this.build(view) }
  update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    const doc = view.state.doc.toString()
    const re = /\[\[([^\]]+)\]\]/g
    let m
    while ((m = re.exec(doc)) !== null) {
      // Skip attachment embeds — handled by image/pdf plugins
      if (ATTACHMENT_EXTS.test(m[1].split('|')[0])) continue
      builder.add(m.index, m.index + m[0].length, Decoration.mark({ class: 'cm-wikilink' }))
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── Hashtag decoration plugin ───────────────────────────────────────────────
const hashtagPlugin = ViewPlugin.fromClass(class {
  decorations
  constructor(view) { this.decorations = this.build(view) }
  update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    const doc = view.state.doc.toString()
    const re = /(^|\s)(#[a-zA-ZÀ-ÿ0-9_-]+)/g
    let m
    while ((m = re.exec(doc)) !== null) {
      const from = m.index + m[1].length
      builder.add(from, from + m[2].length, Decoration.mark({ class: 'cm-hashtag' }))
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── Wikilink autocomplete ───────────────────────────────────────────────────
function criarWikilinkCompletion(getSuggestionsRef) {
  return async (context) => {
    const before = context.matchBefore(/\[\[[^\]]*/)
    if (!before) return null
    const query = before.text.slice(2)
    let sugestoes = []
    try { sugestoes = await getSuggestionsRef.current?.(query) ?? [] } catch { return null }
    if (!sugestoes.length && query.length === 0) return null

    // Build options with hemisphere-aware labels and insertion
    const options = []
    let lastHemisphere = null

    for (const s of sugestoes) {
      const titulo = typeof s === 'string' ? s : (s.titulo ?? s.label ?? '')
      const hemisphere = s.hemisphere || 'human'
      const relPath = s.relativePath || ''

      // Add separator when hemisphere changes
      if (hemisphere !== lastHemisphere) {
        lastHemisphere = hemisphere
        options.push({
          label: hemisphere === 'machine' ? '⚙ Máquina' : '● Humano',
          type: 'namespace',
          boost: -100,
          apply() {}, // non-selectable separator
        })
      }

      // Machine notes insert relativePath, human notes insert titulo
      const linkText = hemisphere === 'machine' ? relPath : titulo

      options.push({
        label: titulo,
        detail: hemisphere === 'machine' ? relPath.replace(titulo, '').replace(/[/\\]$/, '') : '',
        type: hemisphere === 'machine' ? 'class' : 'text',
        boost: hemisphere === 'human' ? 2 : 1,
        apply(view, _completion, from, to) {
          const insertFrom = before.from
          const docStr = view.state.doc.toString()
          let insertTo = to
          if (docStr.slice(to, to + 2) === ']]') insertTo = to + 2
          const insert = `[[${linkText}]]`
          view.dispatch({
            changes: { from: insertFrom, to: insertTo, insert },
            selection: { anchor: insertFrom + insert.length },
          })
        },
      })
    }

    return {
      from: before.from + 2,
      to: context.pos,
      filter: false,
      options,
    }
  }
}

// ── Auto-close [[ → [[|]] + Backspace inteligente ──────────────────────────
const wikilinkKeymap = keymap.of([
  {
    key: '[',
    run(view) {
      const { from } = view.state.selection.main
      const before = view.state.sliceDoc(Math.max(0, from - 1), from)
      if (before === '[') {
        view.dispatch({
          changes: { from: from - 1, to: from, insert: '[[]]' },
          selection: { anchor: from + 1 },
        })
        return true
      }
      return false
    },
  },
  {
    key: 'Backspace',
    run(view) {
      const { from } = view.state.selection.main
      if (view.state.sliceDoc(from - 2, from + 2) === '[[]]') {
        view.dispatch({ changes: { from: from - 2, to: from + 2, insert: '' }, selection: { anchor: from - 2 } })
        return true
      }
      return false
    },
  },
])

// ── Hide markdown syntax (Live Preview) ─────────────────────────────────────
// ── Live Preview — esconde tokens MD fora da linha ativa (syntax-tree) ──────
const HIDE_TOKENS = new Set([
  'HeaderMark',       // # ## ###
  'EmphasisMark',     // * ** _ __
  'StrikethroughMark',// ~~
  'CodeMark',         // `
  'QuoteMark',        // >
])

const hideMarkdownPlugin = ViewPlugin.fromClass(class {
  decorations = Decoration.none
  constructor(view) { this.decorations = this.build(view) }
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view) {
    const hide = Decoration.replace({})
    const ranges = []
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head)

    // Esconde tokens via syntax tree
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter(node) {
          if (!HIDE_TOKENS.has(node.name)) return
          // Não esconde na linha do cursor
          const nodeLine = view.state.doc.lineAt(node.from)
          if (nodeLine.number === cursorLine.number) return
          ranges.push([node.from, node.to])
        },
      })
    }

    // Também esconde o espaço após # em headings (HeaderMark não inclui o espaço)
    const text = view.state.doc.toString()
    for (const m of text.matchAll(/^(#{1,6}) /gm)) {
      const line = view.state.doc.lineAt(m.index)
      if (line.number === cursorLine.number) continue
      // O espaço após os # (HeaderMark já esconde os #, aqui esconde o espaço)
      ranges.push([m.index + m[1].length, m.index + m[1].length + 1])
    }

    // Ordena e remove sobreposições
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const builder = new RangeSetBuilder()
    let lastTo = -1
    for (const [f, t] of ranges) {
      if (f >= lastTo && f < t) { builder.add(f, t, hide); lastTo = t }
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── HR visual widget ────────────────────────────────────────────────────────
class HRWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr')
    hr.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.15);margin:8px 0;display:block;'
    return hr
  }
  ignoreEvent() { return false }
}

const hrPlugin = ViewPlugin.fromClass(class {
  decorations = Decoration.none
  constructor(view) { this.decorations = this.build(view) }
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i)
      if (line.text.trim() === '---' && i !== cursorLine) {
        builder.add(line.from, line.to, Decoration.replace({ widget: new HRWidget() }))
      }
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── Task checkbox widget (3 states: [ ] [x] [/]) ───────────────────────────
class CheckboxWidget extends WidgetType {
  constructor(state, from, to) { super(); this.state = state; this.from = from; this.to = to }
  toDOM(view) {
    const box = document.createElement('span')
    box.style.cssText = `
      display:inline-flex;align-items:center;justify-content:center;
      width:16px;height:16px;border-radius:3px;cursor:pointer;
      margin-right:6px;vertical-align:middle;user-select:none;
      font-size:10px;line-height:1;flex-shrink:0;
      transition:background 0.15s,border-color 0.15s;
    `
    if (this.state === 'done') {
      box.style.background = '#e4e4e4'
      box.style.border = '1.5px solid #e4e4e4'
      box.style.color = 'white'
      box.textContent = '✓'
    } else if (this.state === 'partial') {
      box.style.background = 'rgba(193,122,58,0.25)'
      box.style.border = '1.5px solid #e4e4e4'
      box.style.color = '#e4e4e4'
      box.textContent = '—'
    } else {
      box.style.background = 'transparent'
      box.style.border = '1.5px solid rgba(128,128,128,0.4)'
      box.textContent = ''
    }
    box.addEventListener('click', e => {
      e.preventDefault()
      const next = this.state === 'empty' ? '[x]' : this.state === 'done' ? '[/]' : '[ ]'
      view.dispatch({ changes: { from: this.from, to: this.to, insert: next } })
    })
    return box
  }
  ignoreEvent() { return false }
}

const taskPlugin = ViewPlugin.fromClass(class {
  decorations = Decoration.none
  constructor(view) { this.decorations = this.build(view) }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to)
      for (const m of text.matchAll(/^- (\[ \]|\[x\]|\[\/\])/gm)) {
        const checkFrom = from + m.index + 2
        const checkTo = checkFrom + m[1].length
        const state = m[1] === '[x]' ? 'done' : m[1] === '[/]' ? 'partial' : 'empty'
        builder.add(checkFrom, checkTo, Decoration.replace({ widget: new CheckboxWidget(state, checkFrom, checkTo) }))
      }
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── Blockquote line decoration ──────────────────────────────────────────────
const blockquotePlugin = ViewPlugin.fromClass(class {
  decorations = Decoration.none
  constructor(view) { this.decorations = this.build(view) }
  update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i)
      if (line.text.startsWith('>')) {
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-blockquote' }))
      }
    }
    return builder.finish()
  }
}, { decorations: v => v.decorations })

// ── Attachment paste/drop extension ──────────────────────────────────────────
function attachmentPasteExtension(vaultPathRef) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const items = event.clipboardData?.items
      if (!items) return false
      for (const item of items) {
        if (!item.type.startsWith('image/') && item.type !== 'application/pdf') continue
        event.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const ext = extDeMimeType(item.type)
        const nome = gerarNomeAnexo(ext)
        file.arrayBuffer().then(async buf => {
          const vp = vaultPathRef.current
          if (!vp) return
          await window.electron.vault.saveAttachment(vp, nome, Array.from(new Uint8Array(buf)))
          view.dispatch({
            changes: { from: view.state.selection.main.from, insert: `![[${nome}]]` },
          })
        })
        return true
      }
      return false
    },
    drop(event, view) {
      const files = event.dataTransfer?.files
      if (!files?.length) return false
      const aceitos = Array.from(files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
      if (!aceitos.length) return false
      event.preventDefault()
      aceitos.forEach(async file => {
        const ext = extDeMimeType(file.type)
        const nome = gerarNomeAnexo(ext)
        const buf = await file.arrayBuffer()
        const vp = vaultPathRef.current
        if (!vp) return
        await window.electron.vault.saveAttachment(vp, nome, Array.from(new Uint8Array(buf)))
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.doc.length
        view.dispatch({ changes: { from: pos, insert: `![[${nome}]]` } })
      })
      return true
    },
  })
}

// ── Image inline decoration (![[image.png]]) ────────────────────────────────
const IMG_RE = /!\[\[([^\]]+\.(png|jpg|jpeg|gif|webp))\]\]/gi

class ImageWidget extends WidgetType {
  constructor(nome) { super(); this.nome = nome }
  toDOM() {
    const img = document.createElement('img')
    img.src = `attachment://${encodeURIComponent(this.nome)}`
    img.alt = this.nome
    img.style.cssText = 'max-width:100%;max-height:400px;display:block;margin:8px 0;border-radius:4px;'
    img.onerror = () => { img.style.display = 'none' }
    return img
  }
  eq(other) { return other.nome === this.nome }
}

function imageDecorationPlugin() {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view) }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet)
        this.decorations = this.build(update.view)
    }
    build(view) {
      const builder = new RangeSetBuilder()
      const doc = view.state.doc.toString()
      IMG_RE.lastIndex = 0
      let m
      while ((m = IMG_RE.exec(doc)) !== null) {
        const from = m.index, to = from + m[0].length
        const line = view.state.doc.lineAt(from)
        const cursorOnLine = view.state.selection.ranges.some(r => r.from >= line.from && r.from <= line.to)
        if (cursorOnLine) continue
        builder.add(from, to, Decoration.replace({ widget: new ImageWidget(m[1]) }))
      }
      return builder.finish()
    }
  }, { decorations: v => v.decorations })
}

// ── PDF widget decoration (![[file.pdf]]) ────────────────────────────────────
const PDF_RE = /!\[\[([^\]]+\.pdf)\]\]/gi

class PdfWidget extends WidgetType {
  constructor(nome, filePath) { super(); this.nome = nome; this.filePath = filePath }
  toDOM() {
    const btn = document.createElement('button')
    btn.textContent = `\u{1F4C4} ${this.nome}`
    btn.style.cssText = 'background:#2a2a2a;border:1px solid #333;border-radius:6px;color:#e4e4e4;padding:6px 12px;cursor:pointer;font-size:13px;display:inline-flex;align-items:center;gap:6px;margin:4px 0;'
    btn.onclick = () => { window.electron?.openPath(this.filePath) }
    return btn
  }
  eq(other) { return other.filePath === this.filePath }
}

function pdfDecorationPlugin(vaultPathRef) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view) }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet)
        this.decorations = this.build(update.view)
    }
    build(view) {
      const vp = vaultPathRef.current
      if (!vp) return Decoration.none
      const builder = new RangeSetBuilder()
      const doc = view.state.doc.toString()
      PDF_RE.lastIndex = 0
      let m
      while ((m = PDF_RE.exec(doc)) !== null) {
        const from = m.index, to = from + m[0].length
        const line = view.state.doc.lineAt(from)
        const cursorOnLine = view.state.selection.ranges.some(r => r.from >= line.from && r.from <= line.to)
        if (cursorOnLine) continue
        const filePath = `${vp}/attachments/${m[1]}`
        builder.add(from, to, Decoration.replace({ widget: new PdfWidget(m[1], filePath) }))
      }
      return builder.finish()
    }
  }, { decorations: v => v.decorations })
}

// ── Backlinks panel ─────────────────────────────────────────────────────────
function BacklinksPanel({ backlinks, onWikiLinkClick }) {
  const [open, setOpen] = useState(false)
  if (!backlinks?.length) return null
  return (
    <div className="border-t border-bdr-2 dark:border-bdr-dark2 flex-shrink-0 bg-bg dark:bg-bg-dark">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-8 py-2 text-left hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-ink-3 dark:text-ink-dark3 transition-transform ${open ? 'rotate-90' : ''}`}>
          <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
        </svg>
        <span className="text-[11px] text-ink-3 dark:text-ink-dark3 uppercase tracking-wider font-medium">Citado em</span>
        <span className="text-[11px] text-ink-3 dark:text-ink-dark3 opacity-60">({backlinks.length})</span>
      </button>
      {open && (
        <div className="px-8 pb-3 flex flex-wrap gap-2">
          {backlinks.map(bl => (
            <button key={bl._filename || bl.id} onClick={() => onWikiLinkClick?.(bl.titulo)}
              className="text-xs text-accent dark:text-accent-dark hover:underline transition-colors">
              ↩ {bl.titulo}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── NoteEditorCM ────────────────────────────────────────────────────────────
export function NoteEditorCM({
  nota,
  textura,
  editorRef,
  cmViewRef,
  backlinks,
  getSuggestions,
  onTituloChange,
  onConteudoChange,
  onWikiLinkClick,
}) {
  const { vaultPath } = useVault()
  const vaultPathRef = useRef(vaultPath)
  useEffect(() => { vaultPathRef.current = vaultPath }, [vaultPath])

  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const tituloRef = useRef(null)
  const isInitializingRef = useRef(true)
  const onChangeRef = useRef(onConteudoChange)
  const onWikilinkRef = useRef(onWikiLinkClick)
  const getSuggestionsRef = useRef(getSuggestions)

  useEffect(() => { onChangeRef.current = onConteudoChange }, [onConteudoChange])
  useEffect(() => { onWikilinkRef.current = onWikiLinkClick }, [onWikiLinkClick])
  useEffect(() => { getSuggestionsRef.current = getSuggestions }, [getSuggestions])

  useEffect(() => {
    if (!containerRef.current) return

    isInitializingRef.current = true

    // Usa nota diretamente (key={navKey} garante que nota já é a nova no remount)
    const conteudoInicial = nota?._rawMarkdown ?? ''

    const view = new EditorView({
      state: EditorState.create({
        doc: conteudoInicial,
        extensions: [
          history(),
          wikilinkKeymap,
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(markdownHighlight),
          markdownHeadingFold,
          codeFolding(),
          foldGutter({
            openText: '▸',
            closedText: '▾',
          }),
          wikilinkPlugin,
          hashtagPlugin,
          hideMarkdownPlugin,
          hrPlugin,
          taskPlugin,
          blockquotePlugin,
          baseTheme,
          EditorView.lineWrapping,
          cmPlaceholder('Escreva algo… use [[nota]], #tag, **negrito**, *itálico*, # Título'),
          autocompletion({
            override: [criarWikilinkCompletion(getSuggestionsRef)],
            activateOnTyping: true,
            activateOnTypingDelay: 100,
            closeOnBlur: false,
            defaultKeymap: true,
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !isInitializingRef.current) {
              onChangeRef.current?.(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              window.dispatchEvent(new Event('paraverso:editor-update'))
            }
          }),
          EditorView.domEventHandlers({
            click(event, view) {
              // Verifica se clicou num elemento decorado como wikilink
              let target = event.target
              while (target && target !== view.dom) {
                if (target.classList?.contains('cm-wikilink')) {
                  const texto = target.textContent ?? ''
                  const titulo = texto.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim()
                  if (titulo) { onWikilinkRef.current?.(titulo); return true }
                }
                target = target.parentElement
              }
              return false
            },
          }),
          // Attachment plugins — paste/drop + inline image + PDF widget
          attachmentPasteExtension(vaultPathRef),
          imageDecorationPlugin(),
          pdfDecorationPlugin(vaultPathRef),
        ],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view
    if (cmViewRef) cmViewRef.current = view

    // Libera onChange após inicialização completa (50ms garante que qualquer onChange inicial já passou)
    setTimeout(() => { isInitializingRef.current = false }, 50)

    if (editorRef) {
      editorRef.current = {
        insertMarkdown(md) {
          const end = view.state.doc.length
          view.dispatch({ changes: { from: end, insert: '\n' + md }, selection: { anchor: end + md.length + 1 } })
          view.focus()
        },
        focus() { view.focus() },
        getMarkdown() { return view.state.doc.toString() },
      }
    }

    return () => { isInitializingRef.current = true; view.destroy(); viewRef.current = null; if (cmViewRef) cmViewRef.current = null }
  }, []) // eslint-disable-line


  // Auto-focus título em notas novas
  useEffect(() => {
    if (nota?.titulo?.startsWith('Sem título') && tituloRef.current) {
      tituloRef.current.focus()
      tituloRef.current.select()
    }
  }, []) // eslint-disable-line

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Título editável inline */}
      <div className="px-8 pt-3 pb-1 flex-shrink-0">
        <input
          ref={tituloRef}
          type="text"
          value={nota?.titulo ?? ''}
          onChange={e => onTituloChange?.(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); viewRef.current?.focus() } }}
          placeholder="Sem título"
          className="w-full font-serif text-2xl font-semibold bg-transparent text-ink dark:text-ink-dark placeholder-ink-3/40 dark:placeholder-ink-dark3/40 focus:outline-none"
        />
      </div>

      <div ref={containerRef} className={`flex-1 overflow-auto ${textura === 'dots' ? 'editor-texture-dots' : textura === 'grid' ? 'editor-texture-grid' : ''}`} />
      <BacklinksPanel backlinks={backlinks} onWikiLinkClick={onWikiLinkClick} />
    </div>
  )
}
