import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { salvarNota } from '../../db/index'

export function NoteEditor({ nota, onTituloChange, onConteudoChange }) {
  const saveTimer = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Escreva algo...',
      }),
    ],
    content: nota.conteudo || '',
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      onConteudoChange(json)
    },
  })

  // Atualizar conteúdo quando nota muda
  useEffect(() => {
    if (editor && nota.conteudo) {
      const atual = JSON.stringify(editor.getJSON())
      const novo = JSON.stringify(nota.conteudo)
      if (atual !== novo) {
        editor.commands.setContent(nota.conteudo, false)
      }
    } else if (editor && !nota.conteudo) {
      editor.commands.setContent('', false)
    }
  }, [nota.id]) // só quando muda de nota

  if (!nota) return null

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

      {/* toolbar simples */}
      {editor && (
        <div className="flex items-center gap-1 px-8 py-1.5 border-b border-bdr-2 dark:border-bdr-dark2 flex-shrink-0">
          {[
            { label: 'B', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), title: 'Negrito' },
            { label: 'I', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), title: 'Itálico' },
            { label: 'H1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), title: 'Título 1' },
            { label: 'H2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), title: 'Título 2' },
            { label: '❝', action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), title: 'Citação' },
            { label: '—', action: () => editor.chain().focus().setHorizontalRule().run(), active: false, title: 'Divisor' },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.action}
              title={btn.title}
              className={`text-xs px-2 py-0.5 rounded transition-colors font-mono ${
                btn.active
                  ? 'bg-accent/20 dark:bg-accent-dark/20 text-accent dark:text-accent-dark'
                  : 'text-ink-3 dark:text-ink-dark3 hover:text-ink dark:hover:text-ink-dark hover:bg-bg-2 dark:hover:bg-bg-dark2'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* editor */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
