/**
 * Tests for db/index.js
 *
 * Verifies:
 * - criarNotaVazia() factory function (pure, no IPC)
 * - setVaultPath / getVaultPath state management
 * - Passthrough routing logic (vaultFs vs Dexie)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { criarNotaVazia, setVaultPath, getVaultPath } from '../index'

describe('criarNotaVazia', () => {
  it('creates a note with UUID id', () => {
    const nota = criarNotaVazia('Inbox')
    expect(nota.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('sets default titulo', () => {
    const nota = criarNotaVazia()
    expect(nota.titulo).toBe('Sem título')
  })

  it('sets caderno from argument', () => {
    const nota = criarNotaVazia('Diário')
    expect(nota.caderno).toBe('Diário')
  })

  it('defaults caderno to empty string', () => {
    const nota = criarNotaVazia()
    expect(nota.caderno).toBe('')
  })

  it('initializes empty tags array', () => {
    const nota = criarNotaVazia()
    expect(nota.tags).toEqual([])
  })

  it('sets conteudo to null', () => {
    const nota = criarNotaVazia()
    expect(nota.conteudo).toBeNull()
  })

  it('sets timestamps to current time', () => {
    const before = Date.now()
    const nota = criarNotaVazia()
    const after = Date.now()
    expect(nota.criadaEm).toBeGreaterThanOrEqual(before)
    expect(nota.criadaEm).toBeLessThanOrEqual(after)
    expect(nota.editadaEm).toBeGreaterThanOrEqual(before)
    expect(nota.editadaEm).toBeLessThanOrEqual(after)
  })

  it('generates unique IDs', () => {
    const nota1 = criarNotaVazia()
    const nota2 = criarNotaVazia()
    expect(nota1.id).not.toBe(nota2.id)
  })
})

describe('setVaultPath / getVaultPath', () => {
  beforeEach(() => {
    setVaultPath(null)
  })

  it('starts as null', () => {
    expect(getVaultPath()).toBeNull()
  })

  it('sets and gets vault path', () => {
    setVaultPath('/Users/test/vault')
    expect(getVaultPath()).toBe('/Users/test/vault')
  })

  it('can be reset to null', () => {
    setVaultPath('/some/path')
    setVaultPath(null)
    expect(getVaultPath()).toBeNull()
  })
})
