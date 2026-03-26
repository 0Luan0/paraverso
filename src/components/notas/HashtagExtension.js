import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Extensão de #hashtags estilo Obsidian
// Digitar #filosofia e pressionar espaço converte em tag
export const Hashtag = Node.create({
  name: 'hashtag',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: el => el.getAttribute('data-tag'),
        renderHTML: attrs => ({ 'data-tag': attrs.tag }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-hashtag]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-hashtag': '',
        'data-tag': node.attrs.tag,
        class: 'hashtag',
      }),
      `#${node.attrs.tag}`,
    ]
  },

  // Converte #texto quando o usuário pressiona espaço ou enter após o tag
  addInputRules() {
    const { type } = this
    return [
      {
        find: /#([\w\u00C0-\u017F]+)(\s)$/,
        handler: ({ state, range, match }) => {
          const tag = match[1]
          if (!tag) return null
          const { tr } = state
          // substitui o #tag + espaço pelo nó + espaço
          tr.replaceWith(range.from, range.to, [
            type.create({ tag }),
            state.schema.text(' '),
          ])
          return tr
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('hashtag-click'),
        props: {
          handleClick(view, pos, event) {
            const el = event.target.closest('[data-hashtag]')
            if (!el) return false
            const tag = el.getAttribute('data-tag')
            if (tag) {
              window.dispatchEvent(new CustomEvent('paraverso:hashtag', { detail: { tag } }))
            }
            return true
          },
        },
      }),
    ]
  },
})
