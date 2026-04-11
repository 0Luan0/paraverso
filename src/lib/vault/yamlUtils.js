/**
 * vault/yamlUtils.js — YAML parsing and serialization for vault files.
 * Pure functions — no IPC, no side effects.
 */

// ── Simple YAML parser (handles the subset we produce) ───────────────────────

export function parseSimpleYaml(yamlBlock) {
  const result = {}
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    if (!key) continue

    // Array: ["item1", "item2"] or []
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim()
      if (!inner) {
        result[key] = []
      } else {
        result[key] = inner.split(',').map(s => {
          s = s.trim()
          if ((s.startsWith('"') && s.endsWith('"')) ||
              (s.startsWith("'") && s.endsWith("'"))) {
            try { return JSON.parse(s) } catch { return s.slice(1, -1) }
          }
          return s
        }).filter(Boolean)
      }
      continue
    }

    // JSON-quoted string: "text with spaces"
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      // Intentional fallback: if JSON.parse fails (e.g. unescaped quote),
      // drop through to the plain-string handlers below instead of throwing.
      try { result[key] = JSON.parse(rawVal); continue } catch { /* fall through */ }
    }

    // Single-quoted string
    if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
      result[key] = rawVal.slice(1, -1)
      continue
    }

    // Integer
    if (/^\d+$/.test(rawVal)) {
      result[key] = parseInt(rawVal, 10)
      continue
    }

    if (rawVal === 'true')  { result[key] = true;  continue }
    if (rawVal === 'false') { result[key] = false; continue }
    if (rawVal === 'null' || rawVal === '~' || rawVal === '') {
      result[key] = null; continue
    }

    result[key] = rawVal
  }
  return result
}

// ── File format: parse ────────────────────────────────────────────────────────

export function parseMdFile(raw) {
  // ── Legacy Paraverso format: ---json frontmatter with TipTap JSON ──
  if (raw.startsWith('---json\n')) {
    const jsonStart = '---json\n'.length
    const jsonEnd = raw.indexOf('\n---', jsonStart)
    if (jsonEnd !== -1) {
      try {
        const frontmatter = JSON.parse(raw.slice(jsonStart, jsonEnd))
        const body = raw.slice(jsonEnd + '\n---'.length).replace(/^\n/, '')
        return { frontmatter, body, format: 'paraverso-legacy' }
      } catch { /* fall through */ }
    }
  }

  // ── YAML frontmatter (--- ... ---) ──
  if (raw.startsWith('---\n') || raw.startsWith('---\r\n')) {
    const searchFrom = raw.startsWith('---\r\n') ? 5 : 4
    const endIdx = raw.indexOf('\n---\n', searchFrom)
    const endIdxEOF = raw.indexOf('\n---', searchFrom)

    let yamlContent, body
    if (endIdx !== -1) {
      yamlContent = raw.slice(searchFrom, endIdx)
      body = raw.slice(endIdx + 5)
    } else if (endIdxEOF !== -1 && endIdxEOF === raw.length - '\n---'.length) {
      yamlContent = raw.slice(searchFrom, endIdxEOF)
      body = ''
    } else {
      return { frontmatter: null, body: raw, format: 'obsidian' }
    }

    const parsed = parseSimpleYaml(yamlContent)
    if (parsed.id) {
      return { frontmatter: parsed, body: body.replace(/^\n/, ''), format: 'paraverso' }
    }

    return { frontmatter: null, body: raw, format: 'obsidian' }
  }

  // Plain markdown
  return { frontmatter: null, body: raw, format: 'plain' }
}

// ── File format: serialize ────────────────────────────────────────────────────

export function yamlStr(s) {
  if (s === null || s === undefined) return '""'
  const str = String(s)
  if (str === '') return '""'
  if (/[:#{}\[\],&*?|<>=!%@`\\"]/.test(str) ||
      str.startsWith(' ') || str.endsWith(' ') ||
      str.includes('\n')) {
    return JSON.stringify(str)
  }
  return str
}

export function serializeNoteYaml(nota) {
  const tags = Array.isArray(nota.tags) && nota.tags.length > 0
    ? '[' + nota.tags.map(t => JSON.stringify(t)).join(', ') + ']'
    : '[]'
  // Write caderno: as the first folder segment (for human readability + backward compat).
  // Location is always derived from the file path, not from this field.
  const folder = nota.folder ?? nota.caderno ?? ''
  const caderno = folder.split('/')[0] || ''
  return [
    '---',
    `id: ${nota.id}`,
    `titulo: ${yamlStr(nota.titulo || '')}`,
    `caderno: ${yamlStr(caderno)}`,
    `tags: ${tags}`,
    `criadaEm: ${nota.criadaEm || Date.now()}`,
    `editadaEm: ${nota.editadaEm || Date.now()}`,
    '---',
    '',
  ].join('\n')
}

// Used for monthly data (keeps ---json format)
export function serializeMdFile(frontmatter, body = '') {
  return `---json\n${JSON.stringify(frontmatter, null, 2)}\n---\n\n${body}`
}
