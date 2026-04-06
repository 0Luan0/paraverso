import { describe, it, expect } from 'vitest'
import { gerarNomeAnexo, resolverPathAnexo, extDeMimeType } from '../attachments'

describe('gerarNomeAnexo', () => {
  it('generates timestamped filename', () => {
    const date = new Date(2026, 3, 5, 14, 30, 45) // April 5, 2026 14:30:45
    const nome = gerarNomeAnexo('png', date)
    expect(nome).toBe('Pasted image 20260405143045.png')
  })

  it('pads single-digit values', () => {
    const date = new Date(2026, 0, 1, 9, 5, 3) // Jan 1, 2026 09:05:03
    const nome = gerarNomeAnexo('jpg', date)
    expect(nome).toBe('Pasted image 20260101090503.jpg')
  })

  it('uses current date when none provided', () => {
    const nome = gerarNomeAnexo('png')
    expect(nome).toMatch(/^Pasted image \d{14}\.png$/)
  })
})

describe('resolverPathAnexo', () => {
  it('joins vault path with attachments folder', () => {
    expect(resolverPathAnexo('/vault', 'image.png')).toBe('/vault/attachments/image.png')
  })
})

describe('extDeMimeType', () => {
  it('maps known MIME types', () => {
    expect(extDeMimeType('image/png')).toBe('png')
    expect(extDeMimeType('image/jpeg')).toBe('jpg')
    expect(extDeMimeType('image/gif')).toBe('gif')
    expect(extDeMimeType('image/webp')).toBe('webp')
    expect(extDeMimeType('application/pdf')).toBe('pdf')
  })

  it('returns bin for unknown types', () => {
    expect(extDeMimeType('application/octet-stream')).toBe('bin')
    expect(extDeMimeType('text/plain')).toBe('bin')
  })
})
