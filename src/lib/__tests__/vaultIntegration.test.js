/**
 * Integration tests for the vault save/read/rename/move/delete pipeline.
 *
 * These tests run the real vault/* modules (noteIO, folderOps, pathUtils)
 * against a real filesystem in a tmp directory, via a fake window.electron
 * that proxies to Node fs. The IPC hop from renderer → main process is
 * replaced by direct fs calls — everything else is production code.
 *
 * Covers the critical user contract: "a saved note always comes back".
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fsp from 'node:fs/promises'

import {
  createMockElectron,
  setupTestVault,
  teardownTestVault,
  installMockElectron,
  uninstallMockElectron,
  readFileSync,
} from './helpers/electronMock.js'

import { saveNote, moveNote, readNote, deleteNote } from '../vault/noteIO.js'
import { resolveFilenameCollision } from '../vault/pathUtils.js'
import { propagateRename, createNotebook } from '../vault/folderOps.js'

// ── Setup / teardown ─────────────────────────────────────────────────────────

let vaultPath

beforeEach(async () => {
  vaultPath = await setupTestVault()
  installMockElectron(createMockElectron())
})

afterEach(async () => {
  uninstallMockElectron()
  await teardownTestVault(vaultPath)
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNota(overrides = {}) {
  const now = Date.now()
  return {
    id: overrides.id || `test-${now}-${Math.random().toString(36).slice(2, 8)}`,
    titulo: 'Nota de teste',
    conteudo: '',
    _rawMarkdown: 'Corpo da nota',
    caderno: '',
    tags: [],
    criadaEm: now,
    editadaEm: now,
    ...overrides,
  }
}

// ── Tests: saveNote round-trip ───────────────────────────────────────────────

describe('saveNote → readNote round-trip', () => {
  it('saves a root-level note and reads it back', async () => {
    const nota = makeNota({ titulo: 'Primeira nota', _rawMarkdown: '# Hello\n\nBody' })
    const savedPath = await saveNote(vaultPath, nota)

    expect(savedPath).toBe(path.join(vaultPath, 'Primeira nota.md'))
    const raw = readFileSync(savedPath)
    expect(raw).toContain('id: ' + nota.id)
    expect(raw).toContain('# Hello')
    expect(raw).toContain('Body')

    const loaded = await readNote(savedPath)
    expect(loaded.id).toBe(nota.id)
    expect(loaded.titulo).toBe('Primeira nota')
    expect(loaded._rawMarkdown).toContain('# Hello')
  })

  it('saves a note inside a notebook folder', async () => {
    await createNotebook(vaultPath, 'Projetos')
    const nota = makeNota({ titulo: 'Ideia', folder: 'Projetos', _rawMarkdown: 'Conteudo' })
    const savedPath = await saveNote(vaultPath, nota)
    expect(savedPath).toBe(path.join(vaultPath, 'Projetos', 'Ideia.md'))

    const loaded = await readNote(savedPath, 'Projetos')
    expect(loaded.id).toBe(nota.id)
    expect(loaded.titulo).toBe('Ideia')
  })

  it('sanitizes unsafe characters in the title to build the filename', async () => {
    const nota = makeNota({ titulo: 'Path/with:unsafe*chars' })
    const savedPath = await saveNote(vaultPath, nota)
    // sanitizeName replaces forbidden chars with '-'
    expect(path.basename(savedPath)).toBe('Path-with-unsafe-chars.md')
  })

  it('preserves id across a save → read → save cycle', async () => {
    const nota = makeNota({ titulo: 'Nota A' })
    const p1 = await saveNote(vaultPath, nota)
    const loaded = await readNote(p1)
    loaded._rawMarkdown = 'Atualizado'
    const p2 = await saveNote(vaultPath, loaded)
    const reloaded = await readNote(p2)
    expect(reloaded.id).toBe(nota.id)
    expect(reloaded._rawMarkdown).toContain('Atualizado')
  })

  it('renames the file on disk when titulo changes', async () => {
    const nota = makeNota({ titulo: 'Título antigo' })
    const p1 = await saveNote(vaultPath, nota)
    expect(await fileExists(p1)).toBe(true)

    nota.titulo = 'Título novo'
    const p2 = await saveNote(vaultPath, nota)
    expect(p2).toBe(path.join(vaultPath, 'Título novo.md'))
    expect(await fileExists(p2)).toBe(true)
    expect(await fileExists(p1)).toBe(false)
  })
})

// ── Tests: filename collision resolver ───────────────────────────────────────

describe('resolveFilenameCollision', () => {
  it('returns the base name when no file exists', async () => {
    const result = await resolveFilenameCollision(vaultPath, 'Fresh', 'note-1')
    expect(result).toBe('Fresh')
  })

  it('returns the same base when the existing file has the same id', async () => {
    await saveNote(vaultPath, makeNota({ id: 'same-id', titulo: 'Same' }))
    const result = await resolveFilenameCollision(vaultPath, 'Same', 'same-id')
    expect(result).toBe('Same')
  })

  it('appends a numeric suffix when a file with that name has a different id', async () => {
    await saveNote(vaultPath, makeNota({ id: 'id-A', titulo: 'Duplicada' }))
    const result = await resolveFilenameCollision(vaultPath, 'Duplicada', 'id-B')
    expect(result).toBe('Duplicada 2')
  })

  it('finds the next free slot when multiple suffixes are taken', async () => {
    await saveNote(vaultPath, makeNota({ id: 'id-A', titulo: 'Dup' }))
    await saveNote(vaultPath, makeNota({ id: 'id-B', titulo: 'Dup' })) // becomes "Dup 2"
    const result = await resolveFilenameCollision(vaultPath, 'Dup', 'id-C')
    expect(result).toBe('Dup 3')
  })
})

// ── Tests: moveNote between folders ──────────────────────────────────────────

describe('moveNote', () => {
  it('moves a note from root to a notebook folder', async () => {
    await createNotebook(vaultPath, 'Projetos')
    const nota = makeNota({ titulo: 'To move' })
    const srcPath = await saveNote(vaultPath, nota)
    expect(await fileExists(srcPath)).toBe(true)

    const moved = await moveNote(vaultPath, { ...nota, _filename: 'To move' }, 'Projetos')
    expect(moved.folder).toBe('Projetos')

    const newPath = path.join(vaultPath, 'Projetos', 'To move.md')
    expect(await fileExists(newPath)).toBe(true)
    expect(await fileExists(srcPath)).toBe(false)
  })

  it('moves a note from a notebook back to root', async () => {
    await createNotebook(vaultPath, 'Projetos')
    const nota = makeNota({ titulo: 'Coming home', folder: 'Projetos' })
    const srcPath = await saveNote(vaultPath, nota)

    const moved = await moveNote(vaultPath, { ...nota, _filename: 'Coming home' }, '')
    expect(moved.folder).toBe('')

    const rootPath = path.join(vaultPath, 'Coming home.md')
    expect(await fileExists(rootPath)).toBe(true)
    expect(await fileExists(srcPath)).toBe(false)
  })

  it('is a no-op when source and target folder are identical', async () => {
    await createNotebook(vaultPath, 'Projetos')
    const nota = makeNota({ titulo: 'Stay', folder: 'Projetos' })
    const srcPath = await saveNote(vaultPath, nota)

    const notaWithFilename = { ...nota, _filename: 'Stay' }
    const result = await moveNote(vaultPath, notaWithFilename, 'Projetos')
    expect(result).toBe(notaWithFilename) // identity returned on no-op
    expect(await fileExists(srcPath)).toBe(true)
  })

  it('rejects path traversal in target folder', async () => {
    const nota = makeNota({ titulo: 'Evil' })
    await saveNote(vaultPath, nota)
    await expect(
      moveNote(vaultPath, { ...nota, _filename: 'Evil' }, '../../../etc')
    ).rejects.toThrow(/inválido/i)
  })
})

// ── Tests: propagateRename ───────────────────────────────────────────────────

describe('propagateRename', () => {
  it('updates [[wikilinks]] across all notes in the vault', async () => {
    await saveNote(vaultPath, makeNota({
      id: 'a', titulo: 'Alpha', _rawMarkdown: 'Vai ver [[Target]] pra entender.',
    }))
    await saveNote(vaultPath, makeNota({
      id: 'b', titulo: 'Beta', _rawMarkdown: 'Ref: [[Target|alias]] e outra [[Target]].',
    }))
    await saveNote(vaultPath, makeNota({
      id: 'c', titulo: 'Gamma', _rawMarkdown: 'Nenhum link aqui.',
    }))

    const updated = await propagateRename(vaultPath, 'Target', 'Objetivo')

    expect(updated).toHaveLength(2)
    const alphaRaw = readFileSync(path.join(vaultPath, 'Alpha.md'))
    const betaRaw = readFileSync(path.join(vaultPath, 'Beta.md'))
    const gammaRaw = readFileSync(path.join(vaultPath, 'Gamma.md'))

    expect(alphaRaw).toContain('[[Objetivo]]')
    expect(alphaRaw).not.toContain('[[Target]]')

    expect(betaRaw).toContain('[[Objetivo|alias]]')
    expect(betaRaw).toContain('[[Objetivo]]')
    expect(betaRaw).not.toContain('[[Target')

    expect(gammaRaw).not.toContain('Objetivo')
  })

  it('skips wikilinks inside fenced code blocks', async () => {
    const md = [
      'Texto vivo [[Target]].',
      '```',
      'Código: [[Target]] não deve mudar',
      '```',
      'Mais vivo [[Target]].',
    ].join('\n')
    await saveNote(vaultPath, makeNota({ id: 'x', titulo: 'Mix', _rawMarkdown: md }))

    await propagateRename(vaultPath, 'Target', 'Novo')
    const raw = readFileSync(path.join(vaultPath, 'Mix.md'))

    // Live text rewritten
    expect(raw).toMatch(/Texto vivo \[\[Novo\]\]/)
    expect(raw).toMatch(/Mais vivo \[\[Novo\]\]/)
    // Code block preserved literally
    expect(raw).toContain('Código: [[Target]] não deve mudar')
  })

  it('is a no-op when old and new titles are equal', async () => {
    await saveNote(vaultPath, makeNota({ id: 'a', titulo: 'A', _rawMarkdown: '[[Same]]' }))
    const updated = await propagateRename(vaultPath, 'Same', 'Same')
    expect(updated).toEqual([])
  })

  it('returns empty array when no note references the old title', async () => {
    await saveNote(vaultPath, makeNota({ id: 'a', titulo: 'A', _rawMarkdown: 'nada' }))
    const updated = await propagateRename(vaultPath, 'Ghost', 'Phantom')
    expect(updated).toEqual([])
  })

  // ── Transactional semantics (#8) ─────────────────────────────────────────
  // When a write fails mid-propagation, propagateRename must roll back
  // every file it already wrote, leaving the vault exactly as it was.
  // No half-updated state, no broken links, no duplicate nodes.
  it('rolls back all writes when one file fails', async () => {
    await saveNote(vaultPath, makeNota({
      id: 'n1', titulo: 'One', _rawMarkdown: 'See [[Target]].',
    }))
    await saveNote(vaultPath, makeNota({
      id: 'n2', titulo: 'Two', _rawMarkdown: 'Ref [[Target]] here.',
    }))
    await saveNote(vaultPath, makeNota({
      id: 'n3', titulo: 'Three', _rawMarkdown: 'And [[Target]] there.',
    }))

    // Snapshot original contents before rename
    const p1 = path.join(vaultPath, 'One.md')
    const p2 = path.join(vaultPath, 'Two.md')
    const p3 = path.join(vaultPath, 'Three.md')
    const original1 = readFileSync(p1)
    const original2 = readFileSync(p2)
    const original3 = readFileSync(p3)

    // Sabotage: make writeFile throw when called for Two.md.
    // propagateRename should catch, roll back One.md (already written),
    // and NOT attempt Three.md.
    const realWriteFile = globalThis.window.electron.writeFile
    globalThis.window.electron.writeFile = async (fp, content) => {
      if (fp === p2) throw new Error('simulated disk error on Two.md')
      return realWriteFile(fp, content)
    }

    let caught = null
    try {
      await propagateRename(vaultPath, 'Target', 'Objetivo')
    } catch (err) {
      caught = err
    } finally {
      globalThis.window.electron.writeFile = realWriteFile
    }

    // Contract: either the function threw OR it returned with rollback applied.
    // Either way, on-disk state must match the original — NO partial update.
    expect(readFileSync(p1)).toBe(original1)
    expect(readFileSync(p2)).toBe(original2)
    expect(readFileSync(p3)).toBe(original3)

    // And it must surface the failure (throw or return a failure signal)
    // so callers can decide what to do. Current code silently swallows.
    expect(caught).not.toBeNull()
  })
})

// ── Tests: deleteNote ────────────────────────────────────────────────────────

describe('deleteNote', () => {
  it('removes the file from disk', async () => {
    const nota = makeNota({ titulo: 'Ephemeral' })
    const p = await saveNote(vaultPath, nota)
    expect(await fileExists(p)).toBe(true)

    // Signature: deleteNote(vaultPath, _caderno, id)
    const ok = await deleteNote(vaultPath, '', nota.id)
    expect(ok).toBe(true)
    expect(await fileExists(p)).toBe(false)
  })

  it('returns false when the note id does not exist', async () => {
    const ok = await deleteNote(vaultPath, '', 'nonexistent-id')
    expect(ok).toBe(false)
  })
})

// ── Local helpers ────────────────────────────────────────────────────────────

async function fileExists(p) {
  try {
    await fsp.access(p)
    return true
  } catch {
    return false
  }
}
