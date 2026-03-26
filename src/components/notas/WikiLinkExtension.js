import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Extensão TipTap para wikilinks estilo Obsidian: [[Nome da Nota]]
export const WikiLink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true, // trata como bloco atômico (não editável internamente)

  addAttributes() {
    return {
      titulo: {
        default: null,
        parseHTML: el => el.getAttribute('data-titulo'),
        renderHTML: attrs => ({ 'data-titulo': attrs.titulo }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink': '',
        'data-titulo': node.attrs.titulo,
        class: 'wikilink',
        style: 'cursor:pointer; color: var(--wikilink-color, #C17A3A); background: var(--wikilink-bg, rgba(193,122,58,0.08)); border-radius: 3px; padding: 0 3px; font-style: normal; white-space: nowrap;',
      }),
      node.attrs.titulo,
    ]
  },

  // Converte [[texto]] automaticamente enquanto digita
  addInputRules() {
    const { type } = this
    return [
      {
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const titulo = match[1]
          if (!titulo.trim()) return null

          const { tr } = state
          tr.replaceWith(range.from, range.to, type.create({ titulo: titulo.trim() }))
          return tr
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikilink-click'),
        props: {
          handleClick(view, pos, event) {
            const el = event.target.closest('[data-wikilink]')
            if (!el) return false
            const titulo = el.getAttribute('data-titulo')
            if (titulo) {
              // dispara evento customizado para o React capturar
              window.dispatchEvent(new CustomEvent('paraverso:wikilink', { detail: { titulo } }))
            }
            return true
          },
        },
      }),
    ]
  },
})
