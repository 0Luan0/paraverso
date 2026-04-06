import { describe, it, expect } from 'vitest'
import { mergeGraphNodes, hemisphereTargetX, machineNodeColor } from '../graphHemisphere'

describe('mergeGraphNodes', () => {
  const humanNotes = [
    { id: '1', titulo: 'Note A', caderno: 'Inbox', tags: [], wikilinks: [] },
    { id: '2', titulo: 'Note B', caderno: 'Diário', tags: [], wikilinks: [] },
  ]

  const machineFiles = [
    '/vault/_machine/contexts/contexto.md',
    '/vault/_machine/pesquisas/topic.md',
  ]

  it('merges human and machine nodes', () => {
    const result = mergeGraphNodes(humanNotes, machineFiles)
    expect(result).toHaveLength(4)
  })

  it('marks human nodes with hemisphere: human', () => {
    const result = mergeGraphNodes(humanNotes, machineFiles)
    const humans = result.filter(n => n.hemisphere === 'human')
    expect(humans).toHaveLength(2)
    expect(humans[0].titulo).toBe('Note A')
  })

  it('marks machine nodes with hemisphere: machine', () => {
    const result = mergeGraphNodes(humanNotes, machineFiles)
    const machines = result.filter(n => n.hemisphere === 'machine')
    expect(machines).toHaveLength(2)
    expect(machines[0].caderno).toBe('_machine')
  })

  it('extracts filename as titulo for machine nodes', () => {
    const result = mergeGraphNodes([], ['/vault/_machine/contexts/contexto.md'])
    expect(result[0].titulo).toBe('contexto')
  })

  it('extracts subpasta from machine path', () => {
    const result = mergeGraphNodes([], ['/vault/_machine/pesquisas/topic.md'])
    expect(result[0].subpasta).toBe('pesquisas')
  })

  it('handles empty inputs', () => {
    expect(mergeGraphNodes([], [])).toEqual([])
    expect(mergeGraphNodes(humanNotes, [])).toHaveLength(2)
    expect(mergeGraphNodes([], machineFiles)).toHaveLength(2)
  })
})

describe('hemisphereTargetX', () => {
  it('returns a function', () => {
    const fn = hemisphereTargetX(1000)
    expect(typeof fn).toBe('function')
  })

  it('returns positive X for machine nodes (right side)', () => {
    const fn = hemisphereTargetX(1000)
    expect(fn({ hemisphere: 'machine' })).toBeGreaterThan(0)
  })

  it('returns negative X for human nodes (left side)', () => {
    const fn = hemisphereTargetX(1000)
    expect(fn({ hemisphere: 'human' })).toBeLessThan(0)
  })

  it('offset is proportional to width', () => {
    const fn1000 = hemisphereTargetX(1000)
    const fn2000 = hemisphereTargetX(2000)
    const node = { hemisphere: 'machine' }
    expect(fn2000(node)).toBe(fn1000(node) * 2)
  })
})

describe('machineNodeColor', () => {
  it('returns the machine purple color', () => {
    expect(machineNodeColor()).toBe('#9d8ff5')
  })
})
