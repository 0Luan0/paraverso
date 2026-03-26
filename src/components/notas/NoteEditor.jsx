import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { WikiLink } from './WikiLinkExtension'
import { Hashtag } from './HashtagExtension'

export function NoteEditor({ nota, onTituloChange, onConteudoChange, onWikiLinkClick }) {
  const saveTimer = useRef(null)

  useEffect(() => {
    function handleWikiLink(e) { onWikiLinkClick?.(e.detail.titulo) }
    window.addEventListener('paraverso:wikilink', handleWikiLink)
    return () => window.removeEventListener('paraverso:wikilink', handleWikiLink)
  }, [onWikiLinkClick])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit já inclui: Bold, Italic, Heading (# ## ### etc),
        // BulletList (- item), OrderedList (1. item),
        // Blockquote (> texto), HorizontalRule (---),
        // Code (`code`), Strike (~~texto~~)
        heading: { levels: [1, 2, 3, 4, 5] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Placeholder.configure({
        placeholder: 'Escreva algo… use [[nota]], #tag, **negrito**, *itálico*, # Título',
      }),
      // Checklist padrão TipTap (2 estados: [ ] e [x])
      // Input rules: - [ ] e - [x]
      TaskList.configure({ HTMLAttributes: { class: 'task-list' } }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: { class: 'task-item' },
      }),
      WikiLink,
      Hashtag,
    ],
    content: nota.conteudo || '',
    editorProps: {
      attributes: { class: 'tiptap focus:outline-none' },
    },
    onUpdate: ({ editor }) => {
      onConteudoChange(editor.getJSON())
    },
  })

  useEffect(() => {
    if (!editor) return
    if (nota.conteudo) {
      const atual = JSON.stringify(editor.getJSON())
      const novo = JSON.stringify(nota.conteudo)
      if (atual !== novo) editor.commands.setContent(nota.conteudo, false)
    } else {
      editor.commands.setContent('', false)
    }
  }, [nota.id])

  if (!nota) return null

  const toolbarBtns = [
    { label: 'B', title: 'Negrito (**texto**)', action: () => editor.chain().focus().toggleBold().run(), active: () => editor.isActive('bold') },
    { label: 'I', title: 'Itálico (*texto*)', action: () => editor.chain().focus().toggleItalic().run(), active: () => editor.isActive('italic') },
    { label: 'S', title: 'Tachado (~~texto~~)', action: () => editor.chain().focus().toggleStrike().run(), active: () => editor.isActive('strike') },
    null, // separador
    { label: 'H1', title: 'Título 1 (# )', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor.isActive('heading', { level: 1 }) },
    { label: 'H2', title: 'Título 2 (## )', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Título 3 (### )', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor.isActive('heading', { level: 3 }) },
    null,
    { label: '—', title: 'Lista com marcadores (- )', action: () => editor.chain().focus().toggleBulletList().run(), active: () => editor.isActive('bulletList') },
    { label: '1.', title: 'Lista numerada (1. )', action: () => editor.chain().focus().toggleOrderedList().run(), active: () => editor.isActive('orderedList') },
    { label: '☐', title: 'Checklist (- [ ] )', action: () => editor.chain().focus().toggleTaskList().run(), active: () => editor.isActive('taskList') },
    null,
    { label: '❝', title: 'Citação (> )', action: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
    { label: '`', title: 'Código inline', action: () => editor.chain().focus().toggleCode().run(), active: () => editor.isActive('code') },
    { label: '─', title: 'Linha divisória (---)', action: () => editor.chain().focus().setHorizontalRule().run(), active: () => false },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* título */}
      <div className="px-8 pt-6 pb-2 flex-shrink-0">
        <input
          type="text"
          value={nota.titulo}
          onChange={e => onTituloChange(e.target.value)}
          placeholder="Título"
          className="w-full font-serif text-2xl font-medium bg-transparent text-ink dark:text-ink-dark placeholder-ink-3 dark:placeholder-ink-dark3 focus:outline-none border-b border-transparent focus:border-bdr-2 dark:focus:border-bdr-dark2 pb-1 transition-colors"
        />
      </div>

      {/* toolbar */}
      {editor && (
        <div className="flex items-center gap-0.5 px-6 py-1.5 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0 flex-wrap">
          {toolbarBtns.map((btn, i) =>
            btn === null ? (
              <div key={i} className="w-px h-4 bg-bdr dark:bg-bdr-dark mx-1" />
            ) : (
              <button
                key={btn.label}
                onClick={btn.action}
                title={btn.title}
                className={`text-xs px-2 py-0.5 rounded transition-colors font-mono min-w-[24px] text-center ${
                  btn.active()
                    ? 'bg-accent/20 dark:bg-accent-dark/20 text-accent dark:text-accent-dark'
                    : 'text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark hover:bg-bg-2 dark:hover:bg-bg-dark2'
                }`}
              >
                {btn.label}
              </button>
            )
          )}
          <span className="ml-auto text-xs text-ink-3/40 dark:text-ink-dark3/40 font-normal hidden sm:block">
            [[nota]] · #tag · **negrito** · *itálico*
          </span>
        </div>
      )}

      {/* editor */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
