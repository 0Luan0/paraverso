import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Estados do checklist estilo Obsidian:
// todo  → - [ ]  (vazio)
// doing → - [/]  (em progresso)
// done  → - [x]  (concluído)

const ESTADOS = ['todo', 'doing', 'done']

export const TriStateTaskItem = Node.create({
  name: 'triStateTaskItem',
  group: 'listItem',
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      state: {
        default: 'todo',
        parseHTML: el => el.getAttribute('data-state') || 'todo',
        renderHTML: attrs => ({ 'data-state': attrs.state }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li[data-task-item]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const state = node.attrs.state
    const icons = { todo: '☐', doing: '◑', done: '☑' }
    return [
      'li',
      mergeAttributes(HTMLAttributes, {
        'data-task-item': '',
        'data-state': state,
        class: `task-item task-item--${state}`,
      }),
      [
        'span',
        {
          class: 'task-checkbox',
          contenteditable: 'false',
        },
        icons[state] || '☐',
      ],
      ['div', { class: 'task-content' }, 0],
    ]
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem('triStateTaskItem'),
      'Shift-Tab': () => this.editor.commands.liftListItem('triStateTaskItem'),
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('tristate-click'),
        props: {
          handleClick(view, pos, event) {
            const el = event.target.closest('.task-checkbox')
            if (!el) return false

            const li = el.closest('li[data-task-item]')
            if (!li) return false

            const state = li.getAttribute('data-state') || 'todo'
            const nextState = ESTADOS[(ESTADOS.indexOf(state) + 1) % ESTADOS.length]

            // localiza a posição do nó no documento
            const { doc } = view.state
            let targetPos = null
            doc.descendants((node, nodePos) => {
              if (node.type.name === 'triStateTaskItem') {
                const domNode = view.nodeDOM(nodePos)
                if (domNode === li || domNode?.contains(li)) {
                  targetPos = nodePos
                  return false
                }
              }
            })

            if (targetPos !== null) {
              const tr = view.state.tr.setNodeMarkup(targetPos, null, {
                state: nextState,
              })
              view.dispatch(tr)
            }

            return true
          },
        },
      }),
    ]
  },
})
