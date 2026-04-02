const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises

const isDev = process.env.NODE_ENV === 'development'

// ── Config persistence ────────────────────────────────────────────────────────
// Stores settings in a simple JSON file in the OS user-data folder
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

async function loadConfig() {
  try {
    const raw = await fsp.readFile(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveConfig(obj) {
  await fsp.writeFile(getConfigPath(), JSON.stringify(obj, null, 2), 'utf-8')
}

// ── Config lock — serializa escritas para evitar read-modify-write race ──────
let configLock = Promise.resolve()

// ── Path validation — impede acesso fora do vault ────────────────────────────
function getVaultPath() {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw).vaultPath || null
  } catch {
    return null
  }
}

function validatePath(filePath) {
  const vaultPath = getVaultPath()
  if (!vaultPath) throw new Error('Nenhum vault configurado')
  const resolved = path.resolve(filePath)
  const resolvedVault = path.resolve(vaultPath)
  if (!resolved.startsWith(resolvedVault + path.sep) && resolved !== resolvedVault) {
    throw new Error(`Path fora do vault: acesso negado — ${resolved}`)
  }
  return resolved
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Bloqueia navegação da janela para URLs externas (ex: links obsidian:// colados).
  // Isso evita que <a href="..."> clicados dentro do editor abram uma nova janela
  // ou naveguem para fora do app.
  win.webContents.on('will-navigate', (event, url) => {
    const isAppUrl = url.startsWith('http://localhost') || url.startsWith('file://')
    if (!isAppUrl) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────────────────────────
function registerIpcHandlers() {

  // ── File System ─────────────────────────────────────────────────────────────

  ipcMain.handle('fs:readFile', async (_e, filePath) => {
    try {
      validatePath(filePath)
      return await fsp.readFile(filePath, 'utf-8')
    } catch (err) {
      throw new Error(`fs:readFile falhou: ${err.message}`)
    }
  })

  ipcMain.handle('fs:writeFile', async (_e, filePath, content) => {
    try {
      validatePath(filePath)
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, content, 'utf-8')
      return true
    } catch (err) {
      throw new Error(`fs:writeFile falhou: ${err.message}`)
    }
  })

  ipcMain.handle('fs:readdir', async (_e, dirPath, opts = {}) => {
    try {
      validatePath(dirPath)
      const dirents = await fsp.readdir(dirPath, { withFileTypes: true })
      if (opts.dirsOnly) {
        // return only subdirectory names, skip hidden files/dirs (starting with .)
        return dirents
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name)
      }
      // default: return all entry names (files + dirs)
      return dirents.map(d => d.name)
    } catch {
      return []
    }
  })

  // ── Recursive file listing (Node 18.17+ / Electron 28+) ─────────────────────
  // Returns absolute paths to all .md files under dirPath, at any depth.
  // This replaces the fragile multi-IPC recursive approach.
  ipcMain.handle('fs:readdirRecursive', async (_e, dirPath) => {
    try {
      validatePath(dirPath)
      const entries = await fsp.readdir(dirPath, {
        recursive: true,
        withFileTypes: true,
      })
      return entries
        .filter(e => e.isFile() && !e.name.startsWith('.') && e.name.endsWith('.md'))
        .map(e => {
          // e.parentPath (Node 21.4+) or e.path (Node 18-20) — may be relative in older versions.
          // Always resolve to absolute path to guarantee _topDir comparisons work.
          const parent = e.parentPath ?? e.path
          const absParent = (parent && path.isAbsolute(parent))
            ? parent
            : path.resolve(dirPath, parent ?? '')
          return path.join(absParent, e.name)
        })
    } catch {
      return []
    }
  })

  ipcMain.handle('fs:mkdir', async (_e, dirPath) => {
    try {
      validatePath(dirPath)
      await fsp.mkdir(dirPath, { recursive: true })
      return true
    } catch (err) {
      throw new Error(`fs:mkdir falhou: ${err.message}`)
    }
  })

  ipcMain.handle('fs:exists', async (_e, filePath) => {
    try {
      validatePath(filePath)
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:rename', async (_e, oldPath, newPath) => {
    try {
      validatePath(oldPath)
      validatePath(newPath)
      await fsp.mkdir(path.dirname(newPath), { recursive: true })
      await fsp.rename(oldPath, newPath)
      return true
    } catch (err) {
      throw new Error(`fs:rename falhou: ${err.message}`)
    }
  })

  ipcMain.handle('fs:deleteFile', async (_e, filePath) => {
    try {
      validatePath(filePath)
      await fsp.unlink(filePath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('shell:openPath', async (_e, filePath) => {
    try {
      return await shell.openPath(filePath)
    } catch (err) {
      throw new Error(`shell:openPath falhou: ${err.message}`)
    }
  })

  // ── Dialog ───────────────────────────────────────────────────────────────────

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Escolha a pasta do seu vault Paraverso',
      buttonLabel: 'Usar esta pasta',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Config ────────────────────────────────────────────────────────────────────

  ipcMain.handle('config:get', async (_e, key) => {
    const cfg = await loadConfig()
    return cfg[key] ?? null
  })

  ipcMain.handle('config:set', async (_e, key, value) => {
    // Serializa escritas via lock para evitar race condition read-modify-write
    configLock = configLock.then(async () => {
      const cfg = await loadConfig()
      cfg[key] = value
      await saveConfig(cfg)
    }).catch(err => {
      console.error('[config:set] erro:', err)
    })
    await configLock
    return true
  })

  // ── Path utilities ────────────────────────────────────────────────────────────

  ipcMain.handle('path:join', async (_e, ...parts) => {
    return path.join(...parts)
  })

  // ── Find in page (Cmd+F) ──────────────────────────────────────────────────────

  ipcMain.handle('find:inPage', async (_e, text, opts = {}) => {
    const [win] = BrowserWindow.getAllWindows()
    if (win && text) win.webContents.findInPage(text, { forward: true, findNext: false, ...opts })
    return true
  })

  ipcMain.handle('find:stop', async () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) win.webContents.stopFindInPage('clearSelection')
    return true
  })
}
