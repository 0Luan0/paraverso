import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Extensão de #hashtags estilo Obsidian
// Digitar #filosofia e pressionar espaço converte em chip de tag
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

  // nodeInputRule: API canônica TipTap v3 para nós inline atômicos
  // Dispara quando o usuário digita #palavra seguido de espaço
  addInputRules() {
    return [
      nodeInputRule({
        find: /#([\w\u00C0-\u017F]+)\s$/,
        type: this.type,
        getAttributes: match => ({ tag: match[1] }),
      }),
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
            event.preventDefault()
            event.stopPropagation()
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
