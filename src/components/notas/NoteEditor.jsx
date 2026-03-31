/**
 * NoteEditor.jsx — Editor de notas com TipTap
 *
 * Features:
 * - TipTap: Bold, Italic, Strike, Headings, BulletList, OrderedList,
 *   TaskList, Blockquote, Code, HorizontalRule, WikiLink, Hashtag
 * - Toolbar visual
 * - FindBar: Cmd+F
 * - Painel de backlinks no rodapé
 * - AutoClose: [[→[[|]]  **→**|**  *→*|*  (→(|)  "→"|"
 * - Autocomplete [[wikilink]] com dropdown estilo Obsidian
 *
 * NoteEditor é remontado (key=navKey) a cada navegação —
 * getInitialContent() recebe sempre a nota correta sem useEffect adicional.
 */

import { useEffect, useRef, useReducer, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { WikiLink } from './WikiLinkExtension'
import { Hashtag } from './HashtagExtension'
import { FindBar } from './FindBar'
import { markdownParaTipTapJson, normalizeWikiLinksToText } from '../../lib/markdownUtils'

// ── AutoClose Extension ───────────────────────────────────────────────────────
// Pares: digitar o primeiro char insere o segundo e posiciona cursor entre eles.
// Regras:
//   (  →  (|)
//   "  →  "|"   (só fora de texto que já está dentro de aspas)
//   *  →  *|*   (só se NÃO está dentro de itálico/negrito ativo)
//   segundo * → **|** (negrito)
//
// IMPORTANTE: `[` é tratado no WikiLinkExtension (auto-close [[|]])
const AutoClose = Extension.create({
  name: 'autoClose',
  priority: 200,

  addKeyboardShortcuts() {
    const insert = (editor, pair, offsetBack = 1) => {
      const pos = editor.state.selection.from
      editor.chain().insertContentAt(pos, pair).setTextSelection(pos + offsetBack).run()
      return true
    }

    return {
      // ( → (|)
      '(': () => {
        const { empty } = this.editor.state.selection
        if (!empty) return false
        return insert(this.editor, '()', 1)
      },

      // " → "|"  — só se o char anterior não for outra aspa (evita loop)
      '"': () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty) return false
        const prev = $from.parent.textContent.slice($from.parentOffset - 1, $from.parentOffset)
        if (prev === '"') return false // já tem aspa, não fecha de novo
        return insert(this.editor, '""', 1)
      },

      // * → *|*  (italic auto-close)
      // Mas se o char anterior JÁ é `*` → faz **|** (bold auto-close)
      '*': () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty) return false
        if (this.editor.isActive('code')) return false

        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)

        // Se o char anterior é `*` (usuário digitou `**`) → auto-close bold **|**
        if (textBefore.endsWith('*')) {
          // Não faz auto-close se já tiver `***` (evitar triplo-star)
          if (textBefore.endsWith('**')) return false
          const pos = this.editor.state.selection.from
          this.editor.chain()
            .insertContentAt(pos, '**')
            .setTextSelection(pos + 1)
            .run()
          return true
        }

        // Caso simples: `*` solitário → *|*
        // Não auto-fecha se já estiver dentro de itálico ativo
        if (this.editor.isActive('italic')) return false
        return insert(this.editor, '**', 1)
      },
    }
  },
})

// ── ListItemExit: Backspace no início de lista sai para parágrafo ─────────────
const ListItemExit = Extension.create({
  name: 'listItemExit',
  priority: 200,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parentOffset > 0) return false
        if ($from.parent.type.name !== 'paragraph') return false
        const listItem = $from.node($from.depth - 1)
        if (!listItem) return false
        if (listItem.type.name === 'listItem')  return this.editor.commands.liftListItem('listItem')
        if (listItem.type.name === 'taskItem')  return this.editor.commands.liftListItem('taskItem')
        return false
      },
    }
  },
})

// ── Textura do fundo do editor ────────────────────────────────────────────────
const TEXTURA_CLASS = {
  dots: 'editor-texture-dots',
  grid: 'editor-texture-grid',
  none: '',
}

// ── Toolbar config ────────────────────────────────────────────────────────────
function makeToolbar(editor) {
  return [
    { label: 'B',  title: 'Negrito',        action: () => editor.chain().focus().toggleBold().run(),                  active: () => editor.isActive('bold') },
    { label: 'I',  title: 'Itálico',        action: () => editor.chain().focus().toggleItalic().run(),                active: () => editor.isActive('italic') },
    { label: 'S',  title: 'Tachado',        action: () => editor.chain().focus().toggleStrike().run(),                active: () => editor.isActive('strike') },
    null,
    { label: 'H1', title: 'Título 1 (# )',  action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),  active: () => editor.isActive('heading', { level: 1 }) },
    { label: 'H2', title: 'Título 2 (## )', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),  active: () => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Título 3 (###)', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),  active: () => editor.isActive('heading', { level: 3 }) },
    null,
    { label: '—',  title: 'Lista',           action: () => editor.chain().focus().toggleBulletList().run(),           active: () => editor.isActive('bulletList') },
    { label: '1.', title: 'Lista numerada', action: () => editor.chain().focus().toggleOrderedList().run(),           active: () => editor.isActive('orderedList') },
    { label: '☐',  title: 'Checklist',       action: () => editor.chain().focus().toggleTaskList().run(),             active: () => editor.isActive('taskList') },
    null,
    { label: '❝',  title: 'Citação',         action: () => editor.chain().focus().toggleBlockquote().run(),           active: () => editor.isActive('blockquote') },
    { label: '`',  title: 'Código inline',   action: () => editor.chain().focus().toggleCode().run(),                 active: () => editor.isActive('code') },
    { label: '─',  title: 'Divisor (---)',   action: () => editor.chain().focus().setHorizontalRule().run(),          active: () => false },
  ]
}

// ── WikiLink Dropdown ─────────────────────────────────────────────────────────

function WikiLinkDropdown({ items, selectedIndex, position, onSelect }) {
  const listRef = useRef(null)
  const containerRef = useRef(null)
  const [flipped, setFlipped] = useState(false)

  // Detecta se o dropdown cabe abaixo; se não, abre acima
  useEffect(() => {
    if (!containerRef.current || !position) return
    const rect = containerRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const spaceBelow = viewportH - (position.y ?? 0)
    const spaceAbove = (position.y ?? 0) - (position.lineHeight ?? 24)
    // Flip se não cabe embaixo mas cabe em cima
    setFlipped(spaceBelow < rect.height + 8 && spaceAbove > spaceBelow)
  }, [position, items?.length])

  // Scroll automático para manter item selecionado visível
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!items?.length) return null

  const y = position?.y ?? 100
  const lineH = position?.lineHeight ?? 24
  const topStyle = flipped ? undefined : y
  const bottomStyle = flipped ? (window.innerHeight - y + lineH + 6) : undefined

  return (
    <div
      ref={containerRef}
      data-wikilink-dropdown=""
      className="fixed z-50 shadow-xl border border-bdr dark:border-bdr-dark bg-surface dark:bg-surface-dark rounded-xl overflow-hidden"
      style={{
        top:       topStyle,
        bottom:    bottomStyle,
        left:      position?.x ?? 100,
        minWidth:  220,
        maxWidth:  360,
        maxHeight: 300,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-bdr-2 dark:border-bdr-dark2 bg-bg dark:bg-bg-dark">
        <span className="text-[10px] text-ink-3 dark:text-ink-dark3 uppercase tracking-widest font-semibold">
          Notas · {items.length}
        </span>
      </div>

      {/* Lista */}
      <div ref={listRef}>
        {items.map((item, i) => (
          <button
            key={`${item.titulo}-${i}`}
            onMouseDown={e => {
              e.preventDefault() // não tira foco do editor
              onSelect(item)
            }}
            className={`w-full text-left px-3 py-2 transition-colors flex flex-col gap-0.5 ${
              i === selectedIndex
                ? 'bg-accent/15 dark:bg-accent-dark/15'
                : 'hover:bg-bg-2 dark:hover:bg-bg-dark2'
            }`}
          >
            <span className={`text-sm truncate font-medium ${
              i === selectedIndex
                ? 'text-accent dark:text-accent-dark'
                : 'text-ink dark:text-ink-dark'
            }`}>
              {item.titulo}
            </span>
            {item.caderno && (
              <span className="text-[11px] text-ink-3 dark:text-ink-dark3 truncate">
                {item.subpasta ? `${item.caderno} / ${item.subpasta}` : item.caderno}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1 border-t border-bdr-2 dark:border-bdr-dark2 bg-bg dark:bg-bg-dark">
        <span className="text-[10px] text-ink-3/50 dark:text-ink-dark3/50">
          ↑↓ navegar · Enter / Tab selecionar · Esc fechar
        </span>
      </div>
    </div>
  )
}

// ── NoteEditor ────────────────────────────────────────────────────────────────

export function NoteEditor({
  nota,
  textura = 'none',
  onTituloChange,
  onConteudoChange,
  onWikiLinkClick,
  editorRef,
  backlinks = [],
  getSuggestions,
}) {
  const [showFind, setShowFind] = useState(false)
  const [backlinksOpen, setBacklinksOpen] = useState(false)

  // ── Suggestion state ───────────────────────────────────────────────────────
  // Usa useReducer + ref para evitar closures stale: o TipTap cria o editor
  // uma única vez, então callbacks passados via configure() não podem usar
  // state React diretamente. A solução é:
  //   1. Armazenar dados do dropdown em suggDataRef (não causa re-render)
  //   2. Chamar forceUpdate() para forçar re-render do dropdown
  //   3. suggHandlers.current sempre aponta para os handlers mais recentes
  const [, forceUpdate] = useReducer(x => x + 1, 0)
  const suggDataRef  = useRef(null)  // { items, selectedIndex, position, command }
  const suggHandlers = useRef({})

  // Atualiza handlers com valores mais recentes (sem re-criar o editor)
  suggHandlers.current = {
    getSuggestions: getSuggestions || (() => []),
    onWikiLinkClick: onWikiLinkClick || (() => {}),
    onSelect(item) {
      suggDataRef.current?.command?.({ titulo: item.titulo })
    },
  }

  // ── Callbacks WikiLink (delegados pelo plugin ProseMirror) ─────────────────

  function onSuggestionStart(payload) {
    suggDataRef.current = {
      items:         payload.items,
      selectedIndex: 0,
      position:      payload.position, // já é { x, y } calculado no plugin
      command:       payload.command,
    }
    forceUpdate()
  }

  function onSuggestionUpdate(payload) {
    // Preserva selectedIndex se a lista não mudou de tamanho
    const prevIdx = suggDataRef.current?.selectedIndex ?? 0
    suggDataRef.current = {
      items:         payload.items,
      selectedIndex: prevIdx < payload.items.length ? prevIdx : 0,
      position:      payload.position,
      command:       payload.command,
    }
    forceUpdate()
  }

  function onSuggestionExit() {
    suggDataRef.current = null
    forceUpdate()
  }

  function onSuggestionKeyDown({ event }) {
    if (!suggDataRef.current) return false
    const { items, selectedIndex } = suggDataRef.current

    if (event.key === 'ArrowDown') {
      suggDataRef.current.selectedIndex = Math.min(selectedIndex + 1, items.length - 1)
      forceUpdate()
      return true
    }
    if (event.key === 'ArrowUp') {
      suggDataRef.current.selectedIndex = Math.max(selectedIndex - 1, 0)
      forceUpdate()
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = items[selectedIndex]
      if (item) suggHandlers.current.onSelect(item)
      return true
    }
    return false
  }

  // ── Cmd+F ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function handler() { setShowFind(true) }
    window.addEventListener('paraverso:find', handler)
    return () => window.removeEventListener('paraverso:find', handler)
  }, [])

  // ── Conteúdo inicial ───────────────────────────────────────────────────────
  // normalizeWikiLinksToText converte nós legados {type:'wikilink'} para texto
  // puro [[titulo]], necessário para backward-compat com docs antigos e para o
  // decoration approach (wikilinks vivem como texto no documento TipTap).
  function getInitialContent() {
    if (nota.conteudo && typeof nota.conteudo === 'object' && nota.conteudo.type === 'doc') {
      console.debug('[NoteEditor] Using conteudo JSON, nodes:', nota.conteudo.content?.length ?? 0)
      return normalizeWikiLinksToText(nota.conteudo)
    }
    if (nota._rawMarkdown) {
      console.debug('[NoteEditor] Using _rawMarkdown, length:', nota._rawMarkdown.length)
      try { return normalizeWikiLinksToText(markdownParaTipTapJson(nota._rawMarkdown)) } catch {/* fallback */}
    }
    console.debug('[NoteEditor] No content — nota keys:', Object.keys(nota), 'conteudo:', typeof nota.conteudo, nota.conteudo)
    return ''
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      ListItemExit,
      AutoClose,
      StarterKit.configure({
        heading:     { levels: [1, 2, 3, 4, 5] },
        bulletList:  { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({
        placeholder: 'Escreva algo… use [[nota]], #tag, **negrito**, *itálico*, # Título',
      }),
      TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'task-item' } }),
      WikiLink.configure({
        // Wrap em arrow fn para sempre ler suggHandlers.current (nunca stale)
        onWikiLinkClick:    (titulo) => suggHandlers.current.onWikiLinkClick(titulo),
        getSuggestions:     (q) => suggHandlers.current.getSuggestions(q),
        onSuggestionStart,
        onSuggestionUpdate,
        onSuggestionExit,
        onSuggestionKeyDown,
      }),
      Hashtag,
    ],
    content: getInitialContent(),
    editorProps: {
      attributes: { class: 'tiptap focus:outline-none' },
      transformPastedHTML: html =>
        html.replace(/<a[^>]*>(\[\[[^\]]*\]\])<\/a>/gi, '$1'),
    },
    onUpdate: ({ editor }) => {
      onConteudoChange(editor.getJSON())
    },
  })

  // Expõe editor via ref
  useEffect(() => {
    if (editorRef) editorRef.current = editor
    return () => { if (editorRef) editorRef.current = null }
  }, [editor, editorRef])

  if (!nota) return null

  const toolbar      = editor ? makeToolbar(editor) : []
  const textureClass = TEXTURA_CLASS[textura] || ''
  const suggData     = suggDataRef.current

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Título ── */}
      <div className="px-8 pt-6 pb-2 flex-shrink-0">
        <input
          type="text"
          value={nota.titulo}
          onChange={e => onTituloChange(e.target.value)}
          placeholder="Título"
          className="w-full font-serif text-2xl font-medium bg-transparent text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none border-b border-transparent focus:border-bdr-2 dark:focus:border-bdr-dark2 pb-1 transition-colors"
        />
        {nota._obsidian && (
          <p className="text-[11px] text-ink-3/70 dark:text-ink-dark3/70 mt-1.5">
            ✦ Importado do Obsidian — edite e salve para converter ao formato Paraverso
          </p>
        )}
      </div>

      {/* ── FindBar ── */}
      {showFind && <FindBar onClose={() => setShowFind(false)} />}

      {/* ── Toolbar ── */}
      {editor && (
        <div className="flex items-center gap-0.5 px-6 py-1.5 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0 flex-wrap">
          {toolbar.map((btn, i) =>
            btn === null ? (
              <div key={`sep-${i}`} className="w-px h-4 bg-bdr dark:bg-bdr-dark mx-1 flex-shrink-0" />
            ) : (
              <button
                key={btn.label}
                onClick={btn.action}
                title={btn.title}
                className={`text-xs px-2 py-0.5 rounded transition-colors font-mono min-w-[24px] text-center flex-shrink-0 ${
                  btn.active()
                    ? 'bg-accent/20 dark:bg-accent-dark/20 text-accent dark:text-accent-dark'
                    : 'text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark hover:bg-bg-2 dark:hover:bg-bg-dark2'
                }`}
              >
                {btn.label}
              </button>
            )
          )}
          <span className="ml-auto text-xs text-ink-3/30 dark:text-ink-dark3/30 hidden sm:block flex-shrink-0">
            [[ → autocomplete · click no link → navegar
          </span>
        </div>
      )}

      {/* ── Editor ── */}
      <div className={`flex-1 overflow-auto px-8 py-4 ${textureClass}`}>
        <EditorContent editor={editor} />
      </div>

      {/* ── Backlinks ── */}
      {backlinks.length > 0 && (
        <div className="border-t border-bdr-2 dark:border-bdr-dark2 flex-shrink-0 bg-bg dark:bg-bg-dark">
          {/* Header com toggle */}
          <button
            onClick={() => setBacklinksOpen(v => !v)}
            className="w-full flex items-center gap-2 px-8 py-2 text-left hover:bg-bg-2 dark:hover:bg-bg-dark2 transition-colors group"
            title={backlinksOpen ? 'Recolher backlinks' : 'Expandir backlinks'}
          >
            {/* Ícone seta curva para a esquerda */}
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-ink-3 dark:text-ink-dark3 transition-transform ${backlinksOpen ? 'rotate-90' : ''}`}
            >
              <polyline points="9 14 4 9 9 4"/>
              <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
            <span className="text-[11px] text-ink-3 dark:text-ink-dark3 uppercase tracking-wider font-medium">
              Citado em
            </span>
            <span className="text-[11px] text-ink-3 dark:text-ink-dark3 opacity-60">
              ({backlinks.length})
            </span>
          </button>

          {/* Lista de backlinks — visível só quando aberto */}
          {backlinksOpen && (
            <div className="px-8 pb-3 flex flex-wrap gap-2">
              {backlinks.map(bl => (
                <button
                  key={bl._filename || bl.id}
                  onClick={() => onWikiLinkClick?.(bl.titulo)}
                  className="text-xs text-accent dark:text-accent-dark hover:underline transition-colors"
                  title={`${bl.titulo} — ${bl.caderno}`}
                >
                  ↩ {bl.titulo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── WikiLink Dropdown ── */}
      {suggData && suggData.items.length > 0 && (
        <WikiLinkDropdown
          items={suggData.items}
          selectedIndex={suggData.selectedIndex}
          position={suggData.position}
          onSelect={item => suggHandlers.current.onSelect(item)}
        />
      )}

    </div>
  )
}
