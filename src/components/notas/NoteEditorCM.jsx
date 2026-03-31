import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder, ViewPlugin, Decoration } from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { autocompletion } from '@codemirror/autocomplete'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ── Markdown syntax highlighting (WYSIWYG-like) ────────────────────────────
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.8em', fontWeight: '700', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '600', lineHeight: '1.4' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '600' },
  { tag: tags.heading4, fontSize: '1.1em', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
  { tag: tags.link, color: 'var(--accent, #C17A3A)' },
  { tag: tags.url, color: 'var(--accent, #C17A3A)', opacity: '0.7' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace', background: 'rgba(128,128,128,0.12)', borderRadius: '3px', padding: '1px 4px' },
  // Fade markdown syntax chars (# ** * ~~ ``` etc)
  { tag: tags.processingInstruction, opacity: '0.35' },
  { tag: tags.meta, opacity: '0.35' },
])

// ── Tema base (Obsidian-like) ───────────────────────────────────────────────
const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px', fontFamily: 'inherit', background: 'transparent' },
  '.cm-content': {
    padding: '24px 32px', caretColor: 'var(--accent, #C17A3A)', fontFamily: 'inherit',
    lineHeight: '1.7', maxWidth: '720px', margin: '0 auto',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { overflow: 'auto', height: '100%' },
  '.cm-placeholder': { color: 'rgba(128,128,128,0.5)', fontStyle: 'italic' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.02)' },
  // Wikilink decoration
  '.cm-wikilink': {
    color: 'var(--accent, #C17A3A)', cursor: 'pointer',
    borderBottom: '1px solid currentColor', opacity: '0.85',
  },
  '.cm-wikilink:hover': { opacity: '1' },
  // Hashtag decoration
  '.cm-hashtag': { color: 'var(--accent, #C17A3A)', opacity: '0.7' },
  // Autocomplete dropdown
  '.cm-tooltip-autocomplete': {
    background: 'var(--surface, #FAF6EF) !important',
    border: '1px solid var(--bdr, #D5CFC4) !important',
    borderRadius: '8px !important',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15) !important',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete ul': { maxHeight: '240px' },
  '.cm-tooltip-autocomplete ul li': { padding: '6px 12px !important', fontSize: '13px', color: 'var(--ink, #1A1A18)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--accent, #C17A3A) !important', color: 'white !important' },
  // Dark mode overrides
  '&.cm-focused .cm-activeLine': { background: 'rgba(255,255,255,0.03)' },
})

// ── Wikilink decoration plugin ──────────────────────────────────────────────
const wikilinkPlugin = ViewPlugin.fromClass(class {
  decorations
  constructor(view) { this.decorations = this.build(view) }
  update(update) { if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view) }
  build(view) {
    const builder = new RangeSetBuilder()
    const doc = view.state.doc.toString()
    const re = /\[\[([^\]]+)\]\]/g
    let m
    while ((m = re.exec(doc)) !== null) builder.add(m.index, m.index + m[0].length, Decoration.mark({ class: 'cm-wikilink' }))
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
  return (context) => {
    const before = context.matchBefore(/\[\[[^\]]*/)
    if (!before) return null
    const query = before.text.slice(2)
    const sugestoes = getSuggestionsRef.current?.(query) ?? []
    if (!sugestoes.length && !query) return null
    return {
      from: before.from,
      options: sugestoes.map(s => ({
        label: typeof s === 'string' ? s : (s.titulo ?? ''),
        detail: typeof s === 'object' ? (s.caderno ?? '') : '',
        type: 'text',
        apply(view, completion, from, to) {
          view.dispatch({
            changes: { from, to, insert: `[[${completion.label}]] ` },
            selection: { anchor: from + completion.label.length + 4 },
          })
        },
      })),
      validFor: /^\[\[[^\]]*$/,
    }
  }
}

// ── Auto-close [[ → [[|]] ──────────────────────────────────────────────────
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
])

// ── Toolbar ─────────────────────────────────────────────────────────────────
function Toolbar({ view }) {
  if (!view) return null
  const btn = (label, title, fn) => (
    <button key={label} title={title} onClick={() => { fn(); view.focus() }}
      className="text-xs px-2 py-0.5 rounded font-mono min-w-[24px] text-center text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors">
      {label}
    </button>
  )
  const sep = (i) => <div key={`s${i}`} className="w-px h-4 bg-bdr dark:bg-bdr-dark mx-1" />
  const wrap = (before, after) => () => {
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    view.dispatch({ changes: { from, to, insert: before + selected + after }, selection: { anchor: from + before.length, head: from + before.length + selected.length } })
  }
  const line = (prefix) => () => {
    const ln = view.state.doc.lineAt(view.state.selection.main.from)
    if (ln.text.startsWith(prefix)) {
      view.dispatch({ changes: { from: ln.from, to: ln.from + prefix.length, insert: '' } })
    } else {
      view.dispatch({ changes: { from: ln.from, insert: prefix } })
    }
  }
  const hr = () => {
    const { to } = view.state.selection.main
    view.dispatch({ changes: { from: to, insert: '\n\n---\n\n' } })
  }
  return (
    <div className="flex items-center gap-0.5 px-6 py-1.5 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0 flex-wrap">
      {btn('B', 'Negrito (**)', wrap('**', '**'))}
      {btn('I', 'Itálico (*)', wrap('*', '*'))}
      {btn('S', 'Tachado (~~)', wrap('~~', '~~'))}
      {sep(0)}
      {btn('H1', 'Título 1', line('# '))}
      {btn('H2', 'Título 2', line('## '))}
      {btn('H3', 'Título 3', line('### '))}
      {sep(1)}
      {btn('—', 'Lista', line('- '))}
      {btn('1.', 'Lista numerada', line('1. '))}
      {btn('☐', 'Checklist', line('- [ ] '))}
      {sep(2)}
      {btn('❝', 'Citação', line('> '))}
      {btn('`', 'Código', wrap('`', '`'))}
      {btn('─', 'Divisor (---)', hr)}
      <span className="ml-auto text-xs text-ink-3/30 dark:text-ink-dark3/30 hidden sm:block flex-shrink-0">
        [[ → autocomplete
      </span>
    </div>
  )
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
  backlinks,
  getSuggestions,
  onTituloChange,
  onConteudoChange,
  onWikiLinkClick,
}) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
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
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(markdownHighlight),
          wikilinkPlugin,
          hashtagPlugin,
          baseTheme,
          EditorView.lineWrapping,
          cmPlaceholder('Escreva algo… use [[nota]], #tag, **negrito**, *itálico*, # Título'),
          autocompletion({
            override: [criarWikilinkCompletion(getSuggestionsRef)],
            activateOnTyping: true,
            closeOnBlur: true,
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && !isInitializingRef.current) {
              onChangeRef.current?.(update.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            click(event, view) {
              const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
              if (pos == null) return false
              const doc = view.state.doc.toString()
              const re = /\[\[([^\[\]]+)\]\]/g
              let m
              while ((m = re.exec(doc)) !== null) {
                if (pos >= m.index && pos <= m.index + m[0].length) {
                  const titulo = m[1].split('|')[0].trim()
                  if (titulo) { onWikilinkRef.current?.(titulo); return true }
                }
              }
              return false
            },
          }),
        ],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view

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

    return () => { isInitializingRef.current = true; view.destroy(); viewRef.current = null }
  }, []) // eslint-disable-line

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-2 flex-shrink-0">
        <input
          type="text"
          value={nota?.titulo ?? ''}
          onChange={e => onTituloChange?.(e.target.value)}
          placeholder="Título"
          className="w-full font-serif text-2xl font-medium bg-transparent text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none border-b border-transparent focus:border-bdr-2 dark:focus:border-bdr-dark2 pb-1 transition-colors"
        />
        {nota?._obsidian && (
          <p className="text-[11px] text-ink-3/70 dark:text-ink-dark3/70 mt-1.5">
            ✦ Importado do Obsidian
          </p>
        )}
      </div>
      <Toolbar view={viewRef.current} />
      <div ref={containerRef} className={`flex-1 overflow-auto ${textura === 'dots' ? 'editor-texture-dots' : textura === 'grid' ? 'editor-texture-grid' : ''}`} />
      <BacklinksPanel backlinks={backlinks} onWikiLinkClick={onWikiLinkClick} />
    </div>
  )
}
