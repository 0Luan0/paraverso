import { describe, it, expect } from 'vitest'
import { corPorCaderno } from '../graphColors'

describe('corPorCaderno', () => {
  it('returns fixed purple for _machine', () => {
    expect(corPorCaderno('_machine')).toBe('#9d8ff5')
  })

  it('returns fixed purple for empty/null caderno', () => {
    expect(corPorCaderno('')).toBe('#9d8ff5')
    expect(corPorCaderno(null)).toBe('#9d8ff5')
    expect(corPorCaderno(undefined)).toBe('#9d8ff5')
  })

  it('returns a color from the palette for regular notebooks', () => {
    const color = corPorCaderno('Inbox')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(color).not.toBe('#9d8ff5') // not the machine color
  })

  it('is deterministic — same input always returns same color', () => {
    const color1 = corPorCaderno('Diário')
    const color2 = corPorCaderno('Diário')
    expect(color1).toBe(color2)
  })

  it('different notebooks can get different colors', () => {
    const colors = new Set([
      corPorCaderno('Inbox'),
      corPorCaderno('Diário'),
      corPorCaderno('Arquivo'),
      corPorCaderno('Projetos'),
      corPorCaderno('Codex'),
    ])
    // With 5 inputs and 8-color palette, expect at least 2 different colors
    expect(colors.size).toBeGreaterThanOrEqual(2)
  })
})
