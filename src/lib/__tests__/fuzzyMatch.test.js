import { describe, it, expect } from 'vitest'
import { fuzzyMatch, fuzzyFilter } from '../fuzzyMatch'

describe('fuzzyMatch', () => {
  it('returns no match for empty inputs', () => {
    expect(fuzzyMatch('', 'abc').match).toBe(false)
    expect(fuzzyMatch('abc', '').match).toBe(false)
    expect(fuzzyMatch('', '').match).toBe(false)
  })

  it('scores prefix match highest (2)', () => {
    const result = fuzzyMatch('React Hooks', 'react')
    expect(result.match).toBe(true)
    expect(result.score).toBe(2)
  })

  it('scores substring match medium (1)', () => {
    const result = fuzzyMatch('My React Hooks', 'react')
    expect(result.match).toBe(true)
    expect(result.score).toBe(1)
  })

  it('scores fuzzy subsequence low (0.5)', () => {
    const result = fuzzyMatch('Draft Thesis', 'dt')
    expect(result.match).toBe(true)
    expect(result.score).toBe(0.5)
  })

  it('returns no match when chars not in order', () => {
    expect(fuzzyMatch('abc', 'ca').match).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('React', 'REACT').match).toBe(true)
    expect(fuzzyMatch('REACT', 'react').match).toBe(true)
  })
})

describe('fuzzyFilter', () => {
  const items = [
    { titulo: 'React Hooks' },
    { titulo: 'My React Project' },
    { titulo: 'Draft Thesis' },
    { titulo: 'Unrelated Note' },
  ]

  it('returns all items when query is empty', () => {
    const result = fuzzyFilter(items, '', i => i.titulo)
    expect(result).toHaveLength(4)
  })

  it('filters and sorts by score', () => {
    const result = fuzzyFilter(items, 'react', i => i.titulo)
    expect(result).toHaveLength(2)
    expect(result[0].titulo).toBe('React Hooks')       // prefix match (2)
    expect(result[1].titulo).toBe('My React Project')   // substring match (1)
  })

  it('supports fuzzy matching', () => {
    const result = fuzzyFilter(items, 'dt', i => i.titulo)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].titulo).toBe('Draft Thesis')
  })

  it('searches multiple fields', () => {
    const items2 = [
      { titulo: 'Note', folder: 'Projetos/Web' },
      { titulo: 'Other', folder: 'Archive' },
    ]
    const result = fuzzyFilter(items2, 'web', i => [i.titulo, i.folder])
    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('Note')
  })

  it('respects limit', () => {
    const result = fuzzyFilter(items, '', i => i.titulo, 2)
    expect(result).toHaveLength(2)
  })
})
