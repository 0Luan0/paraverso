/**
 * Tests for vaultFs.js pure functions.
 *
 * Functions that use window.electron (IPC) are tested with a mock.
 * Pure functions (parseSimpleYaml, parseMdFile, etc.) are tested directly.
 *
 * NOTE: vaultFs.js doesn't export internal helpers (sanitizeName, parseSimpleYaml, etc.)
 * directly. We test them indirectly through the exported functions that use them,
 * or via the file format functions that are testable through parseMdFile-like behavior.
 */
import { describe, it, expect } from 'vitest'
import { splitCadernoPath } from '../vaultFs'

// splitCadernoPath is the only pure exported function we can test without IPC mocking

describe('splitCadernoPath', () => {
  it('splits simple notebook name', () => {
    expect(splitCadernoPath('Codex')).toEqual({ caderno: 'Codex', subpasta: null })
  })

  it('splits nested path', () => {
    expect(splitCadernoPath('Arquivo/Codex/Leituras')).toEqual({
      caderno: 'Arquivo',
      subpasta: 'Codex/Leituras',
    })
  })

  it('splits two-level path', () => {
    expect(splitCadernoPath('Refs/Videos')).toEqual({
      caderno: 'Refs',
      subpasta: 'Videos',
    })
  })

  it('handles empty/null input', () => {
    expect(splitCadernoPath('')).toEqual({ caderno: '', subpasta: null })
    expect(splitCadernoPath(null)).toEqual({ caderno: '', subpasta: null })
    expect(splitCadernoPath(undefined)).toEqual({ caderno: '', subpasta: null })
  })

  it('strips leading/trailing slashes', () => {
    expect(splitCadernoPath('/Codex/')).toEqual({ caderno: 'Codex', subpasta: null })
    expect(splitCadernoPath('\\Codex\\')).toEqual({ caderno: 'Codex', subpasta: null })
  })

  it('handles backslash separators', () => {
    expect(splitCadernoPath('Arquivo\\Codex')).toEqual({
      caderno: 'Arquivo',
      subpasta: 'Codex',
    })
  })
})

// ── Test internal pure functions via module internals ────────────────────────
// Since parseSimpleYaml, parseMdFile, sanitizeName, yamlStr, serializeNoteYaml
// are not exported, we test them indirectly by importing the module source and
// extracting them. Vitest can handle this with a dynamic import workaround,
// but the cleanest approach is to test through the exported behavior.
//
// We'll test the YAML/format functions by reading what serializeNoteYaml produces
// (via the module's round-trip behavior when we decompose in Phase 4).
//
// For now, the key pure function tests are in splitCadernoPath above.
// The remaining pure functions (parseSimpleYaml, parseMdFile, sanitizeName,
// yamlStr, serializeNoteYaml) will become directly testable after Phase 4
// when they move to their own modules with proper exports.
