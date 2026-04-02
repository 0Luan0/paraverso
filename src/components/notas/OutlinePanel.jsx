import { useState, useEffect, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

function extrairHeadings(view) {
  if (!view) return []
  const headings = []
  const doc = view.state.doc
  syntaxTree(view.state).iterate({
    enter(node) {
      const match = node.name.match(/^ATXHeading(\d)$/)
      if (!match) return
      const level = parseInt(match[1])
      const line = doc.lineAt(node.from)
      const text = line.text.replace(/^#{1,6}\s+/, '').trim()
      if (text) headings.push({ level, text, line: line.number, from: node.from })
    },
  })
  return headings
}

export function OutlinePanel({ cmViewRef, isOpen }) {
  const [headings, setHeadings] = useState([])
  const [cursorLine, setCursorLine] = useState(0)

  const refresh = useCallback(() => {
    const view = cmViewRef?.current
    if (!view) return
    setHeadings(extrairHeadings(view))
    setCursorLine(view.state.doc.lineAt(view.state.selection.main.head).number)
  }, [cmViewRef])

  useEffect(() => {
    if (!isOpen) return
    refresh()
    window.addEventListener('paraverso:editor-update', refresh)
    return () => window.removeEventListener('paraverso:editor-update', refresh)
  }, [isOpen, refresh])

  if (!isOpen) return null

  function navegarPara(heading) {
    const view = cmViewRef?.current
    if (!view) return
    view.dispatch({
      selection: { anchor: heading.from },
      effects: EditorView.scrollIntoView(heading.from, { y: 'center' }),
    })
    view.focus()
  }

  // Heading ativo = último heading acima ou na linha do cursor
  let activeIdx = -1
  for (let i = headings.length - 1; i >= 0; i--) {
    if (headings[i].line <= cursorLine) { activeIdx = i; break }
  }

  return (
    <div className="w-[200px] min-w-[200px] border-l border-bdr dark:border-bdr-dark overflow-y-auto flex flex-col py-3 px-2 flex-shrink-0 bg-bg dark:bg-bg-dark">
      <div className="text-[11px] font-semibold tracking-wider text-ink-3 dark:text-ink-dark3 uppercase mb-2 px-1">
        Índice
      </div>

      {headings.length === 0 && (
        <div className="text-[12px] text-ink-3 dark:text-ink-dark3 px-1 italic opacity-60">
          Sem headings
        </div>
      )}

      {headings.map((h, i) => {
        const isActive = i === activeIdx
        return (
          <button
            key={`${h.from}-${h.line}`}
            onClick={() => navegarPara(h)}
            className={`text-left rounded px-1.5 py-0.5 truncate transition-colors ${
              h.level === 1 ? 'text-[13px] font-medium' : 'text-[12px]'
            } ${h.level <= 2 ? 'font-medium' : 'font-normal'} ${
              isActive
                ? 'text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/10 border-l-2 border-accent dark:border-accent-dark'
                : 'text-ink-2 dark:text-ink-dark2 border-l-2 border-transparent hover:bg-ink/5 dark:hover:bg-ink-dark/5'
            }`}
            style={{ paddingLeft: `${4 + (h.level - 1) * 12}px` }}
            title={h.text}
          >
            {h.text}
          </button>
        )
      })}
    </div>
  )
}
