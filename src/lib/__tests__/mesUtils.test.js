import { describe, it, expect } from 'vitest'
import {
  mesId, criarMesVazio, NOMES_MES, MESES_PT_LOWER, DIAS_SEMANA,
  dailyNoteTitle, monthFolderName, monthConfigTitle, resumoNoteTitle
} from '../mesUtils'

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

  it('starts with empty habits and metas (user creates their own)', () => {
    const mes = criarMesVazio(2026, 1)
    expect(mes.habitos).toHaveLength(0)
    expect(mes.metas).toHaveLength(0)
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

describe('MESES_PT_LOWER', () => {
  it('has 12 months in lowercase', () => {
    expect(MESES_PT_LOWER).toHaveLength(12)
    expect(MESES_PT_LOWER[0]).toBe('janeiro')
    expect(MESES_PT_LOWER[3]).toBe('abril')
  })
})

describe('DIAS_SEMANA', () => {
  it('has 7 days starting with Domingo', () => {
    expect(DIAS_SEMANA).toHaveLength(7)
    expect(DIAS_SEMANA[0]).toBe('Domingo')
    expect(DIAS_SEMANA[6]).toBe('Sábado')
  })
})

describe('dailyNoteTitle', () => {
  it('formats as "dia mês ano"', () => {
    expect(dailyNoteTitle(2026, 4, 6)).toBe('6 abril 2026')
    expect(dailyNoteTitle(2026, 1, 15)).toBe('15 janeiro 2026')
  })
})

describe('monthFolderName', () => {
  it('returns YYYY-MM format', () => {
    expect(monthFolderName(2026, 4)).toBe('2026-04')
    expect(monthFolderName(2026, 12)).toBe('2026-12')
  })
})

describe('monthConfigTitle', () => {
  it('returns "Month Year"', () => {
    expect(monthConfigTitle(2026, 4)).toBe('Abril 2026')
  })
})

describe('resumoNoteTitle', () => {
  it('returns "Resumo Month Year"', () => {
    expect(resumoNoteTitle(2026, 4)).toBe('Resumo Abril 2026')
  })
})
