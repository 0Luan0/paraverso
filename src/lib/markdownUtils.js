/**
 * markdownUtils.js
 * - markdownParaTipTapJson(md)    → TipTap JSON (legado, usado por vaultFs para carregar notas)
 * - tiptapJsonParaMarkdown(json)  → Markdown string (legado, fallback no save)
 * - parseObsidianFrontmatter(raw) → { meta, body } de arquivos Obsidian
 */

// ── Markdown → TipTap JSON ────────────────────────────────────────────────────
//
// Converts plain Markdown to TipTap's native JSON format.
// This is MORE reliable than markdown→HTML→TipTap because TipTap receives
// its own format directly — no HTML parsing step that can drop structure.
//
// Supported block elements:
//   # ## ### Headings,  --- hr,  ``` code block,  > blockquote,
//   - bullet list,  1. ordered list,  - [ ] task list
// Supported inline elements:
//   **bold**, *italic*, ***bold+italic***, ~~strike~~, `code`, [[wikilinks]]

function _parseInlineTipTap(text) {
  if (!text) return [{ type: 'text', text: '' }]

  const result = []
  let pos = 0

  // Only use * for bold/italic (never _ or __).
  // Underscores are very common in note titles, variable names, filenames, etc.
  // Using _ as italic marker causes TipTap JSON corruption on those strings.
  //
  // Groups: 1=***bold+italic***  2=**bold**  3=~~strike~~  4=`code`  5=*italic*  6=[[wikilink]]
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|~~(.+?)~~|`(.+?)`|\*(.+?)\*|\[\[(.+?)\]\]/g

  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > pos) {
      result.push({ type: 'text', text: text.slice(pos, m.index) })
    }

    const full = m[0]
    if (full.startsWith('***')) {
      result.push({ type: 'text', text: m[1], marks: [{ type: 'bold' }, { type: 'italic' }] })
    } else if (full.startsWith('**')) {
      result.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] })
    } else if (full.startsWith('~~')) {
      result.push({ type: 'text', text: m[3], marks: [{ type: 'strike' }] })
    } else if (full.startsWith('`')) {
      result.push({ type: 'text', text: m[4], marks: [{ type: 'code' }] })
    } else if (full.startsWith('*')) {
      result.push({ type: 'text', text: m[5], marks: [{ type: 'italic' }] })
    } else if (full.startsWith('[[')) {
      // Wikilinks são armazenados como texto puro no TipTap (decoration approach).
      // O WikiLinkExtension aplica um decoration para estilizar [[...]] como link.
      result.push({ type: 'text', text: full })
    }

    pos = m.index + full.length
  }

  if (pos < text.length) result.push({ type: 'text', text: text.slice(pos) })
  return result.length > 0 ? result : [{ type: 'text', text }]
}

function _isBlockBoundary(t) {
  // t = trimmed line. Returns true if this line starts a block-level element.
  if (!t) return true
  if (/^#{1,6}\s/.test(t)) return true
  if (/^[-*_]{3,}\s*$/.test(t)) return true
  if (t.startsWith('```')) return true
  if (t.startsWith('> ') || t === '>') return true
  if (/^[-*+] /.test(t)) return true
  if (/^\d+[.)]\s/.test(t)) return true
  if (/^- \[[ xX]\] /.test(t)) return true
  return false
}

function _parseBlocksTipTap(lines) {
  const nodes = []
  let i = 0

  while (i < lines.length) {
    // Always use trimmed line for pattern matching — Obsidian/editors
    // sometimes produce leading spaces before # - > markers.
    const trimmed = lines[i].trimStart()

    // Skip blank lines
    if (!trimmed) { i++; continue }

    // Heading: # Text  (leading spaces ignored; allow empty heading text)
    const hm = trimmed.match(/^(#{1,6})\s+(.*)/)
    if (hm) {
      const headingText = (hm[2] || '').trim()
      nodes.push({
        type: 'heading',
        attrs: { level: hm[1].length },
        content: headingText ? _parseInlineTipTap(headingText) : [{ type: 'text', text: '' }],
      })
      i++; continue
    }

    // Heading with no space: "##title" (no space) — not a valid heading, treat as paragraph
    // but we must NOT let _isBlockBoundary trap it (it checks /^#{1,6}\s/ so this won't match).
    // Lone "#" line — treat as paragraph below.

    // Horizontal rule (--- / *** / ___)
    if (/^[-*_]{3,}\s*$/.test(trimmed)) {
      nodes.push({ type: 'horizontalRule' })
      i++; continue
    }

    // Code block: ```lang
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || null
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]); i++
      }
      if (i < lines.length) i++ // skip closing ```
      nodes.push({
        type: 'codeBlock',
        attrs: { language: lang },
        content: [{ type: 'text', text: codeLines.join('\n') }],
      })
      continue
    }

    // Blockquote: > text  (leading spaces ignored)
    if (trimmed.startsWith('> ') || trimmed === '>') {
      const bqLines = []
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (!t.startsWith('> ') && t !== '>') break
        bqLines.push(t.replace(/^> ?/, '')); i++
      }
      const inner = _parseBlocksTipTap(bqLines)
      nodes.push({ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] })
      continue
    }

    // Task list: - [ ] or - [x]  (leading spaces ignored)
    if (/^- \[[ xX]\] /.test(trimmed)) {
      const items = []
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (!/^- \[[ xX]\] /.test(t)) break
        const checked = /^- \[[xX]\] /.test(t)
        const text = t.replace(/^- \[[ xX]\] /, '')
        items.push({
          type: 'taskItem',
          attrs: { checked },
          content: [{ type: 'paragraph', content: _parseInlineTipTap(text) }],
        })
        i++
      }
      nodes.push({ type: 'taskList', content: items })
      continue
    }

    // Bullet list: - item  or  * item  (leading spaces ignored)
    if (/^[-*+] /.test(trimmed)) {
      const items = []
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (!/^[-*+] /.test(t)) break
        const text = t.replace(/^[-*+] /, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: _parseInlineTipTap(text) }],
        })
        i++
      }
      nodes.push({ type: 'bulletList', content: items })
      continue
    }

    // Ordered list: 1. item  (leading spaces ignored)
    if (/^\d+[.)]\s/.test(trimmed)) {
      const items = []
      while (i < lines.length) {
        const t = lines[i].trimStart()
        if (!/^\d+[.)]\s/.test(t)) break
        const text = t.replace(/^\d+[.)]\s+/, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: _parseInlineTipTap(text) }],
        })
        i++
      }
      nodes.push({ type: 'orderedList', content: items })
      continue
    }

    // Paragraph: accumulate until blank line or any block-level element
    const paraLines = []
    while (i < lines.length) {
      const t = lines[i].trimStart()
      if (_isBlockBoundary(t)) break
      paraLines.push(lines[i]); i++
    }
    if (paraLines.length > 0) {
      nodes.push({ type: 'paragraph', content: _parseInlineTipTap(paraLines.join('\n').trim()) })
    } else {
      // Safety valve: _isBlockBoundary returned true but no outer branch consumed this line.
      // This means it's an unrecognised pattern (e.g. heading marker without text that somehow
      // slipped through). Advance i to prevent an infinite loop — the line is silently dropped.
      i++
    }
  }

  return nodes
}

/**
 * Convert Markdown to TipTap JSON document.
 * Use this instead of markdownParaHtml when loading notes into TipTap —
 * TipTap receives its own native format, so no HTML parsing issues.
 */
export function markdownParaTipTapJson(md) {
  if (!md?.trim()) return { type: 'doc', content: [{ type: 'paragraph' }] }
  const content = _parseBlocksTipTap(md.split('\n'))
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] }
}

// ── TipTap JSON → Markdown ─────────────────────────────────────────────────────

function _inlineToMd(node) {
  if (!node) return ''
  if (node.type === 'hardBreak') return '\n'
  // O tipo do nó é 'wikilink' (tudo minúsculo) — compatível com WikiLinkExtension.js
  if (node.type === 'wikilink' || node.type === 'wikiLink' || node.type === 'wiki_link') {
    return '[[' + (node.attrs?.titulo || node.attrs?.title || '') + ']]'
  }
  if (node.type === 'hashtag') return '#' + (node.attrs?.tag || '')
  if (node.type !== 'text') return ''

  let text = node.text || ''
  const marks = node.marks || []
  const hasBold   = marks.some(m => m.type === 'bold')
  const hasItalic = marks.some(m => m.type === 'italic')
  const hasStrike = marks.some(m => m.type === 'strike')
  const hasCode   = marks.some(m => m.type === 'code')
  if (hasCode)              return '`' + text + '`'
  if (hasBold && hasItalic) return '***' + text + '***'
  if (hasBold)              return '**' + text + '**'
  if (hasItalic)            return '*' + text + '*'
  if (hasStrike)            return '~~' + text + '~~'
  return text
}

function _inlineContent(node) {
  if (!node?.content) return ''
  return node.content.map(_inlineToMd).join('')
}

function _listItemToMd(item, prefix) {
  const children = item.content || []
  const firstPara = children[0]
  let text = ''
  if (firstPara?.type === 'paragraph') {
    text = _inlineContent(firstPara)
  } else if (firstPara) {
    text = _nodeToMd(firstPara).trim()
  }
  // nested lists
  const rest = children.slice(1)
  const nested = rest.map(n => _nodeToMd(n).split('\n').map(l => '  ' + l).join('\n')).join('')
  return prefix + text + '\n' + nested
}

function _nodeToMd(node) {
  if (!node) return ''
  switch (node.type) {
    case 'paragraph':
      return _inlineContent(node) + '\n\n'
    case 'heading': {
      const lvl = node.attrs?.level || 1
      return '#'.repeat(lvl) + ' ' + _inlineContent(node) + '\n\n'
    }
    case 'bulletList':
      return (node.content || []).map(item => _listItemToMd(item, '- ')).join('') + '\n'
    case 'orderedList':
      return (node.content || []).map((item, i) => _listItemToMd(item, `${i + 1}. `)).join('') + '\n'
    case 'taskList':
      return (node.content || []).map(item => {
        const checked = item.attrs?.checked ? '[x]' : '[ ]'
        return _listItemToMd(item, `- ${checked} `)
      }).join('') + '\n'
    case 'blockquote': {
      const inner = (node.content || []).map(n => _nodeToMd(n)).join('')
      return inner.split('\n').map(l => l ? '> ' + l : '>').join('\n') + '\n'
    }
    case 'codeBlock': {
      const lang = node.attrs?.language || ''
      return '```' + lang + '\n' + _inlineContent(node) + '\n```\n\n'
    }
    case 'horizontalRule':
      return '---\n\n'
    default:
      return _inlineContent(node) + '\n\n'
  }
}

/**
 * Convert TipTap JSON document to a Markdown string.
 * Handles: paragraphs, headings, bullet/ordered/task lists,
 * blockquote, codeBlock, horizontalRule, bold, italic, strike, code,
 * [[wikiLinks]] and #hashtags.
 */
export function tiptapJsonParaMarkdown(json) {
  if (!json) return ''
  if (typeof json === 'string') return json
  const doc = json.type === 'doc' ? json : json
  if (!doc.content) return ''
  return doc.content.map(_nodeToMd).join('').replace(/\n{3,}/g, '\n\n').trimEnd()
}


// ── Obsidian YAML frontmatter ──────────────────────────────────────────────────

/**
 * Parse Obsidian YAML frontmatter.
 * Returns { meta: {key: value, ...}, body: 'markdown content' }
 */
export function parseObsidianFrontmatter(raw) {
  // Obsidian frontmatter: starts with ---\n and ends with \n---\n
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)/)
  if (!match) return { meta: {}, body: raw }

  const yamlBlock = match[1]
  const body = match[2] || ''

  const meta = {}
  for (const line of yamlBlock.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.+)$/)
    if (m) {
      let val = m[2].trim()
      // strip surrounding quotes
      val = val.replace(/^["']|["']$/g, '')
      // parse simple arrays: [item1, item2]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''))
      }
      meta[m[1]] = val
    }
  }

  return { meta, body }
}

