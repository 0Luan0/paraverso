import { describe, it, expect } from 'vitest'
import { readDayData, patchNoteSection, buildDailyNoteContent, buildHabitSection } from '../vault/dailyNoteIO'

const HABITOS = ['Treino', 'Leitura', 'Foco', 'Bem-estar']

describe('readDayData', () => {
  it('parses habit checkboxes and memo from daily note', () => {
    const raw = `# Quarta, 1 de abril de 2026

## Memorável
Dia produtivo

## Hábitos
- [x] Treino
- [ ] Leitura
- [ ] Foco
- [x] Bem-estar

---

Free writing here that Month Tab ignores.`

    const { habitos, memo } = readDayData(raw, HABITOS)
    expect(habitos).toEqual([1, 0, 0, 1])
    expect(memo).toBe('Dia produtivo')
  })

  it('parses [-] as not-done (state 2)', () => {
    const raw = `## Hábitos
- [x] Treino
- [-] Leitura
- [ ] Foco
- [-] Bem-estar`

    const { habitos } = readDayData(raw, HABITOS)
    expect(habitos).toEqual([1, 2, 0, 2])
  })

  it('returns empty habits when no ## Hábitos section', () => {
    const raw = `# Quarta, 1 de abril de 2026

Some text here`

    const { habitos, memo } = readDayData(raw, HABITOS)
    expect(habitos).toEqual([])
    expect(memo).toBe('')
  })

  it('matches habits by name, not position', () => {
    const raw = `## Hábitos
- [x] Foco
- [ ] Treino

## Memorável
Test`

    const { habitos } = readDayData(raw, HABITOS)
    // Treino=0 ([ ]), Leitura=0 (missing), Foco=1 ([x]), Bem-estar=0 (missing)
    expect(habitos).toEqual([0, 0, 1, 0])
  })

  it('memo takes only the first non-empty line', () => {
    const raw = `## Memorável
First line of memo
Second line is ignored

## Hábitos
- [ ] Treino`

    const { memo } = readDayData(raw, HABITOS)
    expect(memo).toBe('First line of memo')
  })

  it('handles section with accent variants (Habitos vs Hábitos)', () => {
    const raw = `## Habitos
- [x] Treino`

    const { habitos } = readDayData(raw, HABITOS)
    expect(habitos).toEqual([1, 0, 0, 0])
  })
})

describe('patchNoteSection', () => {
  const base = `---
id: test
---

# Heading

## Memorável
Old memo

## Hábitos
- [ ] Treino

---`

  it('replaces existing section content', () => {
    const result = patchNoteSection(base, 'Memorável', 'New memo')
    expect(result).toContain('## Memorável\nNew memo')
    expect(result).not.toContain('Old memo')
  })

  it('replaces habit section', () => {
    const newHabits = '- [x] Treino\n- [~] Leitura'
    const result = patchNoteSection(base, 'Hábitos', newHabits)
    expect(result).toContain('- [x] Treino')
    expect(result).toContain('- [~] Leitura')
    expect(result).not.toContain('- [ ] Treino')
  })

  it('inserts section if not found', () => {
    const noMemo = `# Heading

## Hábitos
- [ ] Treino`

    const result = patchNoteSection(noMemo, 'Memorável', 'Added memo')
    expect(result).toContain('## Memorável\nAdded memo')
  })

  it('preserves content outside target section', () => {
    const result = patchNoteSection(base, 'Memorável', 'Changed')
    expect(result).toContain('# Heading')
    expect(result).toContain('## Hábitos')
    expect(result).toContain('- [ ] Treino')
  })
})

describe('buildDailyNoteContent', () => {
  it('builds correct markdown for a day (Memorável before Hábitos)', () => {
    const content = buildDailyNoteContent(2026, 4, 1, HABITOS)

    // April 1 2026 is a Wednesday (Quarta)
    expect(content).toContain('# Quarta, 1 de abril de 2026')
    expect(content).toContain('## Memorável')
    expect(content).toContain('## Hábitos')
    expect(content).toContain('- [ ] Treino')
    expect(content).toContain('- [ ] Bem-estar')
    expect(content).toContain('---')

    // Memorável must come before Hábitos
    const memoIdx = content.indexOf('## Memorável')
    const habIdx = content.indexOf('## Hábitos')
    expect(memoIdx).toBeLessThan(habIdx)
  })
})

describe('buildHabitSection', () => {
  it('builds checklist from habit names and states', () => {
    const section = buildHabitSection(HABITOS, [1, 0, 2, 1])
    expect(section).toBe('- [x] Treino\n- [ ] Leitura\n- [-] Foco\n- [x] Bem-estar')
  })

  it('defaults missing states to empty', () => {
    const section = buildHabitSection(HABITOS, [1])
    expect(section).toContain('- [x] Treino')
    expect(section).toContain('- [ ] Leitura')
  })
})
