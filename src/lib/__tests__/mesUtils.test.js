import { describe, it, expect } from 'vitest'
import { mesId, criarMesVazio, NOMES_MES } from '../mesUtils'

describe('mesId', () => {
  it('pads single-digit months', () => {
    expect(mesId(2026, 1)).toBe('2026-01')
    expect(mesId(2026, 9)).toBe('2026-09')
  })

  it('does not pad double-digit months', () => {
    expect(mesId(2026, 10)).toBe('2026-10')
    expect(mesId(2026, 12)).toBe('2026-12')
  })
})

describe('criarMesVazio', () => {
  it('creates correct number of days for April', () => {
    const mes = criarMesVazio(2026, 4)
    expect(mes.dias).toHaveLength(30)
    expect(mes.id).toBe('2026-04')
    expect(mes.ano).toBe(2026)
    expect(mes.mes).toBe(4)
  })

  it('creates 28 days for non-leap February', () => {
    const mes = criarMesVazio(2025, 2)
    expect(mes.dias).toHaveLength(28)
  })

  it('creates 29 days for leap February', () => {
    const mes = criarMesVazio(2024, 2)
    expect(mes.dias).toHaveLength(29)
  })

  it('each day has correct structure', () => {
    const mes = criarMesVazio(2026, 1)
    const day1 = mes.dias[0]
    expect(day1.n).toBe(1)
    expect(day1.letraDia).toBeDefined()
    expect(day1.memo).toBe('')
    expect(day1.nota).toBe('')
    expect(day1.habitos).toEqual([])
  })

  it('includes default habits and metas', () => {
    const mes = criarMesVazio(2026, 1)
    expect(mes.habitos).toHaveLength(4)
    expect(mes.metas).toHaveLength(2)
    expect(mes.resumo).toBe('')
  })
})

describe('NOMES_MES', () => {
  it('has 12 months', () => {
    expect(NOMES_MES).toHaveLength(12)
  })

  it('starts with Janeiro and ends with Dezembro', () => {
    expect(NOMES_MES[0]).toBe('Janeiro')
    expect(NOMES_MES[11]).toBe('Dezembro')
  })
})
