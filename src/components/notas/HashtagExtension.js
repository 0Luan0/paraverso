import { Node, mergeAttributes, InputRule } from '@tiptap/core'
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

  // InputRule customizado: substitui o match inteiro (#tag) pelo node,
  // mantendo o espaço que disparou a regra. Usar nodeInputRule causava bug:
  // ele só substituía o grupo capturado (match[1]='tag'), deixando o '#' solto
  // antes do node → resultado visível: '# #tag'.
  addInputRules() {
    const type = this.type
    return [
      new InputRule({
        find: /#([\w\u00C0-\u017F]+)\s$/,
        handler({ state, range, match }) {
          const node = type.create({ tag: match[1] })
          // range.from = posição do '#', range.to = posição após o espaço
          // Substitui '#tag' (sem incluir o espaço final) pelo node
          state.tr.replaceWith(range.from, range.to - 1, node)
        },
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
