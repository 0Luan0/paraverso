import { describe, it, expect } from 'vitest'
import { markdownParaTipTapJson, tiptapJsonParaMarkdown, parseObsidianFrontmatter } from '../markdownUtils'

// ── markdownParaTipTapJson ────────────────────────────────────────────────────

describe('markdownParaTipTapJson', () => {
  it('returns empty doc for null/empty input', () => {
    const doc = markdownParaTipTapJson('')
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].type).toBe('paragraph')
  })

  it('parses heading', () => {
    const doc = markdownParaTipTapJson('# Hello')
    expect(doc.content[0].type).toBe('heading')
    expect(doc.content[0].attrs.level).toBe(1)
  })

  it('parses h1 through h6', () => {
    for (let lvl = 1; lvl <= 6; lvl++) {
      const doc = markdownParaTipTapJson('#'.repeat(lvl) + ' Test')
      expect(doc.content[0].attrs.level).toBe(lvl)
    }
  })

  it('parses paragraph', () => {
    const doc = markdownParaTipTapJson('Just a paragraph')
    expect(doc.content[0].type).toBe('paragraph')
  })

  it('parses horizontal rule', () => {
    const doc = markdownParaTipTapJson('---')
    expect(doc.content[0].type).toBe('horizontalRule')
  })

  it('parses bullet list', () => {
    const doc = markdownParaTipTapJson('- item 1\n- item 2')
    expect(doc.content[0].type).toBe('bulletList')
    expect(doc.content[0].content).toHaveLength(2)
  })

  it('parses ordered list', () => {
    const doc = markdownParaTipTapJson('1. first\n2. second')
    expect(doc.content[0].type).toBe('orderedList')
    expect(doc.content[0].content).toHaveLength(2)
  })

  it('parses task list', () => {
    const doc = markdownParaTipTapJson('- [ ] todo\n- [x] done')
    expect(doc.content[0].type).toBe('taskList')
    expect(doc.content[0].content[0].attrs.checked).toBe(false)
    expect(doc.content[0].content[1].attrs.checked).toBe(true)
  })

  it('parses code block', () => {
    const doc = markdownParaTipTapJson('```js\nconst x = 1\n```')
    expect(doc.content[0].type).toBe('codeBlock')
    expect(doc.content[0].attrs.language).toBe('js')
    expect(doc.content[0].content[0].text).toBe('const x = 1')
  })

  it('parses blockquote', () => {
    const doc = markdownParaTipTapJson('> quoted text')
    expect(doc.content[0].type).toBe('blockquote')
  })

  // Inline formatting
  it('parses bold', () => {
    const doc = markdownParaTipTapJson('**bold text**')
    const inline = doc.content[0].content
    const boldNode = inline.find(n => n.marks?.some(m => m.type === 'bold'))
    expect(boldNode.text).toBe('bold text')
  })

  it('parses italic', () => {
    const doc = markdownParaTipTapJson('*italic text*')
    const inline = doc.content[0].content
    const italicNode = inline.find(n => n.marks?.some(m => m.type === 'italic'))
    expect(italicNode.text).toBe('italic text')
  })

  it('parses bold+italic', () => {
    const doc = markdownParaTipTapJson('***both***')
    const inline = doc.content[0].content
    const node = inline.find(n => n.marks?.length === 2)
    expect(node.text).toBe('both')
  })

  it('parses strikethrough', () => {
    const doc = markdownParaTipTapJson('~~strike~~')
    const inline = doc.content[0].content
    const node = inline.find(n => n.marks?.some(m => m.type === 'strike'))
    expect(node.text).toBe('strike')
  })

  it('parses inline code', () => {
    const doc = markdownParaTipTapJson('`code`')
    const inline = doc.content[0].content
    const node = inline.find(n => n.marks?.some(m => m.type === 'code'))
    expect(node.text).toBe('code')
  })

  it('preserves wikilinks as plain text', () => {
    const doc = markdownParaTipTapJson('Link to [[My Note]]')
    const text = doc.content[0].content.map(n => n.text).join('')
    expect(text).toContain('[[My Note]]')
  })
})

// ── tiptapJsonParaMarkdown ────────────────────────────────────────────────────

describe('tiptapJsonParaMarkdown', () => {
  it('returns empty string for null', () => {
    expect(tiptapJsonParaMarkdown(null)).toBe('')
  })

  it('returns string as-is if input is string', () => {
    expect(tiptapJsonParaMarkdown('raw markdown')).toBe('raw markdown')
  })

  it('converts paragraph', () => {
    const json = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }
    expect(tiptapJsonParaMarkdown(json)).toBe('hello')
  })

  it('converts heading', () => {
    const json = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }]
    }
    expect(tiptapJsonParaMarkdown(json)).toBe('## Title')
  })

  it('converts bold/italic marks', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and ' },
          { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        ]
      }]
    }
    expect(tiptapJsonParaMarkdown(json)).toBe('**bold** and *italic*')
  })

  it('converts horizontal rule', () => {
    const json = { type: 'doc', content: [{ type: 'horizontalRule' }] }
    expect(tiptapJsonParaMarkdown(json).trim()).toBe('---')
  })
})

// ── Round-trip: markdown → JSON → markdown ────────────────────────────────────

describe('round-trip', () => {
  const cases = [
    '# Heading 1',
    '## Heading 2',
    '**bold text**',
    '*italic text*',
    '~~strikethrough~~',
    '`inline code`',
    '---',
  ]

  for (const md of cases) {
    it(`preserves: ${md}`, () => {
      const json = markdownParaTipTapJson(md)
      const result = tiptapJsonParaMarkdown(json)
      expect(result.trim()).toBe(md)
    })
  }
})

// ── parseObsidianFrontmatter ──────────────────────────────────────────────────

describe('parseObsidianFrontmatter', () => {
  it('parses YAML frontmatter', () => {
    const raw = '---\ntitle: My Note\ntags: [a, b, c]\n---\nBody text here'
    const { meta, body } = parseObsidianFrontmatter(raw)
    expect(meta.title).toBe('My Note')
    expect(meta.tags).toEqual(['a', 'b', 'c'])
    expect(body).toBe('Body text here')
  })

  it('returns empty meta and full body when no frontmatter', () => {
    const raw = 'Just markdown content'
    const { meta, body } = parseObsidianFrontmatter(raw)
    expect(meta).toEqual({})
    expect(body).toBe('Just markdown content')
  })

  it('strips quotes from values', () => {
    const raw = '---\ntitle: "Quoted Title"\n---\n'
    const { meta } = parseObsidianFrontmatter(raw)
    expect(meta.title).toBe('Quoted Title')
  })

  it('handles empty body', () => {
    const raw = '---\ntitle: Test\n---\n'
    const { meta, body } = parseObsidianFrontmatter(raw)
    expect(meta.title).toBe('Test')
    expect(body).toBe('')
  })
})
