import { describe, it, expect, vi } from 'vitest'
import { resolverVariaveis } from '../templateUtils'

describe('resolverVariaveis', () => {
  it('replaces {{date}} with formatted date', () => {
    const result = resolverVariaveis('Today is {{date}}')
    // Should contain a number (day), month name in Portuguese, and year
    expect(result).toMatch(/Today is \d{1,2} \w+ \d{4}/)
  })

  it('replaces {{time}} with HH:MM format', () => {
    const result = resolverVariaveis('Now: {{time}}')
    expect(result).toMatch(/Now: \d{2}:\d{2}/)
  })

  it('replaces {{Title}} with heading', () => {
    const result = resolverVariaveis('{{Title}}', { titulo: 'My Note' })
    expect(result).toBe('# My Note')
  })

  it('replaces {{title}} with plain text (no heading)', () => {
    const result = resolverVariaveis('Name: {{title}}', { titulo: 'My Note' })
    expect(result).toBe('Name: My Note')
  })

  it('replaces {{Title}} with empty string when no titulo', () => {
    const result = resolverVariaveis('{{Title}}')
    expect(result).toBe('')
  })

  it('replaces {{title}} with empty string when no titulo', () => {
    const result = resolverVariaveis('{{title}}')
    expect(result).toBe('')
  })

  it('handles multiple variables in same string', () => {
    const result = resolverVariaveis('{{Title}}\n{{date}}\n{{time}}', { titulo: 'Test' })
    const lines = result.split('\n')
    expect(lines[0]).toBe('# Test')
    expect(lines[1]).toMatch(/\d{1,2} \w+ \d{4}/)
    expect(lines[2]).toMatch(/\d{2}:\d{2}/)
  })

  it('is case-insensitive for date and time', () => {
    const r1 = resolverVariaveis('{{DATE}}')
    const r2 = resolverVariaveis('{{Date}}')
    // Both should be replaced (not left as-is)
    expect(r1).not.toContain('{{')
    expect(r2).not.toContain('{{')
  })

  it('is case-sensitive for Title vs title', () => {
    const withH = resolverVariaveis('{{Title}}', { titulo: 'X' })
    const without = resolverVariaveis('{{title}}', { titulo: 'X' })
    expect(withH).toBe('# X')
    expect(without).toBe('X')
  })

  it('returns empty string for null/undefined input', () => {
    expect(resolverVariaveis(null)).toBe('')
    expect(resolverVariaveis(undefined)).toBe('')
    expect(resolverVariaveis('')).toBe('')
  })
})
