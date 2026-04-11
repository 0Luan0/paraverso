/**
 * electronMock — test harness for vault integration tests.
 *
 * Installs a fake `window.electron` that proxies every IPC call to real
 * Node fs operations against a tmp directory. Lets vault/* modules run
 * their full pipeline (save, rename, move, propagate) without Electron.
 *
 * The API surface mirrors preload.cjs exactly for the methods the vault
 * layer actually uses. See `grep 'el()\.\w+' src/lib/vault/` for coverage.
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/**
 * Build a mock electron API backed by real Node fs.
 * All paths are validated loosely — the real main.cjs enforces vault-
 * containment via validatePath(); we trust callers here since tests are
 * in full control of what they pass.
 */
export function createMockElectron() {
  return {
    joinPath: async (...parts) => path.join(...parts),

    readFile: async (filePath) => fsp.readFile(filePath, 'utf-8'),

    writeFile: async (filePath, content) => {
      // Ensure parent dir exists — vault/* assumes it does, which is the
      // #4 finding from the hm-engineer audit. For now, match main.cjs
      // behavior (it doesn't auto-mkdir either) to keep tests realistic.
      await fsp.writeFile(filePath, content, 'utf-8')
    },

    readdir: async (dirPath, opts = {}) => {
      try {
        const entries = await fsp.readdir(dirPath, { withFileTypes: true })
        const filtered = entries.filter(e => !e.name.startsWith('.'))
        if (opts && opts.dirsOnly) {
          return filtered.filter(e => e.isDirectory()).map(e => e.name)
        }
        return filtered.map(e => e.name)
      } catch {
        return []
      }
    },

    readdirRecursive: async (dirPath) => {
      const results = []
      async function walk(d) {
        let entries
        try {
          entries = await fsp.readdir(d, { withFileTypes: true })
        } catch {
          return
        }
        for (const e of entries) {
          if (e.name.startsWith('.')) continue
          const fp = path.join(d, e.name)
          if (e.isDirectory()) {
            await walk(fp)
          } else if (e.name.endsWith('.md')) {
            results.push(fp)
          }
        }
      }
      await walk(dirPath)
      return results
    },

    mkdir: async (dirPath) => {
      await fsp.mkdir(dirPath, { recursive: true })
    },

    exists: async (filePath) => {
      try {
        await fsp.access(filePath)
        return true
      } catch {
        return false
      }
    },

    rename: async (oldPath, newPath) => {
      await fsp.rename(oldPath, newPath)
    },

    deleteFile: async (filePath) => {
      await fsp.unlink(filePath)
    },

    rmrf: async (dirPath) => {
      await fsp.rm(dirPath, { recursive: true, force: true })
    },

    // Config stubs — save flow uses getConfig for templatesDir once.
    // Return null so callers fall back to defaults.
    getConfig: async () => null,
    setConfig: async () => true,

    // Machine context — integration tests don't exercise it.
    machineContext: {
      init: async () => true,
      readContext: async () => '',
      writeContext: async () => true,
      listFiles: async () => [],
      watch: async () => true,
      unwatch: async () => true,
      onFileChanged: () => {},
      offFileChanged: () => {},
    },

    // Extra methods that may be called incidentally — no-ops.
    openPath: async () => '',
    showItemInFinder: async () => true,
    openFolder: async () => null,
  }
}

/** Create a fresh empty vault in a tmp directory. Returns the absolute path. */
export async function setupTestVault() {
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'paraverso-test-'))
  const vaultPath = path.join(tmpRoot, 'vault')
  await fsp.mkdir(vaultPath, { recursive: true })
  return vaultPath
}

/** Destroy the tmp dir created by setupTestVault. */
export async function teardownTestVault(vaultPath) {
  if (!vaultPath) return
  const tmpRoot = path.dirname(vaultPath)
  // Safety: only delete paths under the OS tmp dir
  if (!tmpRoot.startsWith(os.tmpdir())) {
    throw new Error(`teardownTestVault refuses to rm outside tmp: ${tmpRoot}`)
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true })
}

/** Install the mock on globalThis.window so `el() === window.electron` finds it. */
export function installMockElectron(mock) {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {}
  }
  globalThis.window.electron = mock
}

/** Remove the mock — call in afterEach to avoid leaking into other tests. */
export function uninstallMockElectron() {
  if (globalThis.window) {
    delete globalThis.window.electron
  }
}

/**
 * Convenience: synchronous helper to read a file straight from the test
 * tmp dir without going through the mock. Useful for assertions.
 */
export function readFileSync(filePath) {
  return fs.readFileSync(filePath, 'utf-8')
}
