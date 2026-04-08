const { app, BrowserWindow, shell, ipcMain, dialog, protocol, net } = require('electron')
const { pathToFileURL } = require('url')
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
      webviewTag: true,
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

// Register attachment:// as privileged scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'attachment', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true } },
])

app.whenReady().then(() => {
  // Protocol handler: attachment://filename.png → serves from vault/attachments/
  protocol.handle('attachment', (request) => {
    const nome = decodeURIComponent(request.url.slice('attachment://'.length))
    const vaultPath = getVaultPath()
    if (!vaultPath) return new Response('No vault', { status: 404 })
    const filePath = path.join(vaultPath, 'attachments', nome)
    return net.fetch(pathToFileURL(filePath).toString())
  })

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

  // Revela item (arquivo ou pasta) no Finder/Explorer, destacado.
  ipcMain.handle('shell:showItemInFinder', async (_e, targetPath) => {
    try {
      validatePath(targetPath)
      shell.showItemInFolder(targetPath)
      return true
    } catch (err) {
      throw new Error(`shell:showItemInFinder falhou: ${err.message}`)
    }
  })

  // Remove uma pasta recursivamente (com todos os arquivos e subpastas dentro).
  // Guard: validatePath evita paths fora do vault.
  ipcMain.handle('fs:rmrf', async (_e, dirPath) => {
    try {
      validatePath(dirPath)
      await fsp.rm(dirPath, { recursive: true, force: true })
      return true
    } catch (err) {
      throw new Error(`fs:rmrf falhou: ${err.message}`)
    }
  })

  // ── Import (read-only access to external folders for Obsidian import) ────────

  ipcMain.handle('import:readdir', async (_e, dirPath, opts = {}) => {
    // Read-only: lists entries in any folder (no vault validation).
    // Used exclusively by the Obsidian import flow to scan external vaults.
    try {
      const dirents = await fsp.readdir(dirPath, { withFileTypes: true })
      if (opts.dirsOnly) {
        return dirents
          .filter(d => d.isDirectory() && !d.name.startsWith('.'))
          .map(d => d.name)
      }
      return dirents.map(d => d.name)
    } catch {
      return []
    }
  })

  ipcMain.handle('import:readFile', async (_e, filePath) => {
    // Read-only: reads any file (no vault validation).
    // Used exclusively by the Obsidian import flow to read external .md files.
    try {
      return await fsp.readFile(filePath, 'utf-8')
    } catch (err) {
      throw new Error(`import:readFile falhou: ${err.message}`)
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

  // ── Machine Hemisphere (AI private workspace) ──────────────────────────────

  const MACHINE_DIR = '_machine'

  /**
   * Security check: ensures filePath is inside vaultPath/_machine/.
   * Uses path.resolve — NOT string.includes().
   */
  function isMachinePathMain(filePath, vaultPath) {
    const resolvedFile = path.resolve(filePath).normalize('NFC')
    const resolvedMachine = path.resolve(vaultPath, MACHINE_DIR).normalize('NFC')
    return resolvedFile.startsWith(resolvedMachine + path.sep) ||
           resolvedFile === resolvedMachine
  }

  ipcMain.handle('machine:init', async (_e, vaultPath) => {
    try {
      validatePath(vaultPath)
      const machinePath = path.join(vaultPath, MACHINE_DIR)
      const existed = fs.existsSync(machinePath)

      // Estrutura mínima: só contexts/ + uma única nota contexto.md + README.
      // Nada de templates/pessoa/interesses/estilo/pesquise/brainstorm/escrita —
      // isso poluía o grafo do hemisfério máquina e duplicava conteúdo.
      // A IA (Claude no terminal) escreve o contexto dinamicamente em
      // contexts/contexto.md conforme aprende sobre o usuário.
      await fsp.mkdir(path.join(machinePath, 'contexts'), { recursive: true })

      const contextoPath = path.join(machinePath, 'contexts', 'contexto.md')
      if (!fs.existsSync(contextoPath)) {
        const now = new Date().toISOString()
        const contextoMd = [
          '---',
          'type: machine-context',
          'version: 1',
          `updated: ${now}`,
          '---',
          '',
          '# Contexto',
          '',
          'Este arquivo é gerenciado pela IA (Claude). Ela vai preencher e atualizar',
          'esta nota conforme conhece você melhor através das suas notas do vault.',
          '',
          'Você **não precisa** escrever nada aqui manualmente — basta usar o Claude',
          'no terminal e ele vai construindo o contexto ao longo do tempo.',
          '',
          '## Sobre a pessoa',
          '_(A IA preencherá com o tempo)_',
          '',
          '## Como pensa / escreve',
          '_(A IA preencherá com o tempo)_',
          '',
          '## Interesses e referências',
          '_(A IA preencherá com o tempo)_',
          '',
          '## Projetos e objetivos atuais',
          '_(A IA preencherá com o tempo)_',
          '',
        ].join('\n')
        await fsp.writeFile(contextoPath, contextoMd, 'utf-8')
      }

      // README.md removed — it was recreated every startup after user deleted it.
      // The onboarding note "Como usar Claude" at vault root covers this content.

      return { created: !existed, path: machinePath }
    } catch (err) {
      throw new Error(`machine:init falhou: ${err.message}`)
    }
  })

  ipcMain.handle('machine:readContext', async (_e, filePath) => {
    try {
      const vaultPath = getVaultPath()
      if (!vaultPath) throw new Error('Nenhum vault configurado')
      if (!isMachinePathMain(filePath, vaultPath)) {
        return { error: 'MACHINE_PATH_VIOLATION' }
      }
      validatePath(filePath)
      return await fsp.readFile(filePath, 'utf-8')
    } catch (err) {
      throw new Error(`machine:readContext falhou: ${err.message}`)
    }
  })

  ipcMain.handle('machine:writeContext', async (_e, filePath, content) => {
    try {
      const vaultPath = getVaultPath()
      if (!vaultPath) throw new Error('Nenhum vault configurado')
      if (!isMachinePathMain(filePath, vaultPath)) {
        return { error: 'MACHINE_PATH_VIOLATION' }
      }
      validatePath(filePath)
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      throw new Error(`machine:writeContext falhou: ${err.message}`)
    }
  })

  ipcMain.handle('machine:listFiles', async (_e, vaultPath) => {
    try {
      validatePath(vaultPath)
      const machinePath = path.join(vaultPath, MACHINE_DIR)
      try {
        await fsp.access(machinePath)
      } catch {
        return [] // _machine/ doesn't exist yet
      }
      const entries = await fsp.readdir(machinePath, { recursive: true, withFileTypes: true })
      return entries
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => {
          const parent = e.parentPath ?? e.path
          const absParent = (parent && path.isAbsolute(parent))
            ? parent
            : path.resolve(machinePath, parent ?? '')
          return path.join(absParent, e.name)
        })
    } catch (err) {
      throw new Error(`machine:listFiles falhou: ${err.message}`)
    }
  })


  // ── Terminal embutido (shell puro) ──────────────────────────────────────────
  // Terminal simples: spawna shell interativo, sem nenhuma automacao.
  // Igual a usar o terminal por fora — o usuario digita o que quiser.
  // node-pty carregado lazy para nao crashar o app se o modulo nativo falhar.

  let pty = null
  let ptyProcess = null

  ipcMain.handle('terminal:start', async (event, vaultPath) => {
    try {
      if (!pty) {
        pty = require('node-pty-prebuilt-multiarch')
      }

      if (ptyProcess) {
        try { ptyProcess.kill() } catch {}
        ptyProcess = null
        await new Promise(r => setTimeout(r, 200))
      }

      const shell = process.env.SHELL || '/bin/zsh'

      ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: vaultPath,
        env: {
          ...process.env,
          PATH: `/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
          TERM: 'xterm-256color',
        },
      })

      const webContents = event.sender

      ptyProcess.onData((data) => {
        if (!webContents.isDestroyed()) {
          webContents.send('terminal:data', data)
        }
      })

      ptyProcess.onExit(({ exitCode }) => {
        if (!webContents.isDestroyed()) {
          webContents.send('terminal:exit', exitCode)
        }
        ptyProcess = null
      })

      return { success: true }
    } catch (err) {
      throw new Error(`terminal:start falhou: ${err.message}`)
    }
  })

  ipcMain.handle('terminal:write', (_e, data) => {
    if (ptyProcess) ptyProcess.write(data)
  })

  let currentCols = 120, currentRows = 30
  ipcMain.handle('terminal:resize', (_e, cols, rows) => {
    if (ptyProcess && (cols !== currentCols || rows !== currentRows)) {
      currentCols = cols
      currentRows = rows
      try { ptyProcess.resize(cols, rows) } catch {}
    }
  })

  ipcMain.handle('terminal:kill', () => {
    if (ptyProcess) {
      try { ptyProcess.kill() } catch {}
      ptyProcess = null
    }
  })

  // ── Browser embutido (webview context menu + scraping) ─────────────────────

  const { Menu, MenuItem, webContents: wcModule } = require('electron')
  const { Readability } = require('@mozilla/readability')
  const { JSDOM } = require('jsdom')

  // Native context menu on webview — same pattern as Obsidian Surfing
  ipcMain.on('browser:webviewReady', (_event, webContentsId) => {
    const wc = wcModule.fromId(webContentsId)
    if (!wc) return

    const [win] = BrowserWindow.getAllWindows()

    wc.on('context-menu', (_e, params) => {
      const menuItems = []

      if (params.selectionText && params.selectionText.trim().length > 0) {
        menuItems.push(new MenuItem({
          label: 'Resumir com IA',
          click: () => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('browser:summarize', {
                selectedText: params.selectionText,
                url: params.pageURL,
              })
            }
          },
        }))
        menuItems.push(new MenuItem({ type: 'separator' }))
      }

      menuItems.push(new MenuItem({ label: 'Voltar', enabled: wc.canGoBack(), click: () => wc.goBack() }))
      menuItems.push(new MenuItem({ label: 'Avançar', enabled: wc.canGoForward(), click: () => wc.goForward() }))
      menuItems.push(new MenuItem({ label: 'Recarregar', click: () => wc.reload() }))
      menuItems.push(new MenuItem({ type: 'separator' }))
      menuItems.push(new MenuItem({ label: 'Copiar', role: 'copy', enabled: (params.selectionText || '').length > 0 }))

      const menu = Menu.buildFromTemplate(menuItems)
      menu.popup({ window: win })
    })
  })

  // Scrape a URL and return cleaned article content via Readability
  ipcMain.handle('browser:scrapeUrl', async (_e, url) => {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      })
      const html = await res.text()
      const dom = new JSDOM(html, { url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()
      return {
        title: article?.title || '',
        content: article?.textContent?.slice(0, 8000) || '',
        excerpt: article?.excerpt || '',
      }
    } catch (err) {
      return { error: err.message }
    }
  })

  // ── Machine file watcher ──────────────────────────────────────────────────

  let machineWatcher = null
  const machineDebounceTimers = new Map()

  ipcMain.handle('machine:watch', (event, machinePath) => {
    if (machineWatcher) { try { machineWatcher.close() } catch {} }
    machineDebounceTimers.clear()

    try {
      machineWatcher = fs.watch(machinePath, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
          // Debounce per filename — fs.watch fires multiple events per save
          clearTimeout(machineDebounceTimers.get(filename))
          machineDebounceTimers.set(filename, setTimeout(() => {
            machineDebounceTimers.delete(filename)
            const [win] = BrowserWindow.getAllWindows()
            if (win && !win.isDestroyed()) {
              win.webContents.send('machine:fileChanged', {
                type: eventType,
                filename,
                path: path.join(machinePath, filename),
              })
            }
          }, 300))
        }
      })
    } catch {}
  })

  ipcMain.handle('machine:unwatch', () => {
    if (machineWatcher) {
      try { machineWatcher.close() } catch {}
      machineWatcher = null
    }
  })

  // ── Vault scan (read-only — human hemisphere) ─────────────────────────────

  const SCAN_SKIP = new Set(['_machine', '.obsidian', '.trash', 'node_modules', 'meses', '.git'])

  ipcMain.handle('vault:scanHuman', async (_e, vaultPath) => {
    try {
      validatePath(vaultPath)
      const results = []

      const walk = (dir) => {
        let entries
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

        for (const entry of entries) {
          if (SCAN_SKIP.has(entry.name) || entry.name.startsWith('.')) continue

          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            walk(fullPath)
          } else if (entry.name.endsWith('.md')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8')
              results.push({
                path: fullPath,
                name: entry.name.replace(/\.md$/i, ''),
                preview: content.slice(0, 500),
              })
            } catch {}
          }
        }
      }

      walk(vaultPath)
      return results
    } catch (err) {
      throw new Error(`vault:scanHuman falhou: ${err.message}`)
    }
  })

  // ── Quick task — add to daily note ─────────────────────────────────────────

  // Append task to daily note — finds the file with NFC normalization
  ipcMain.handle('vault:addTask', async (_e, notePath, taskText) => {
    try {
      validatePath(notePath)
      // macOS uses NFD for filenames — normalize to find the file
      let resolved = notePath.normalize('NFC')
      if (!fs.existsSync(resolved)) {
        resolved = notePath.normalize('NFD')
      }
      if (!fs.existsSync(resolved)) {
        // Last resort: scan directory for matching filename
        const dir = path.dirname(notePath)
        const base = path.basename(notePath).normalize('NFC').toLowerCase()
        try {
          const entries = await fsp.readdir(dir)
          const match = entries.find(e => e.normalize('NFC').toLowerCase() === base)
          if (match) resolved = path.join(dir, match)
        } catch {}
      }
      if (!fs.existsSync(resolved)) {
        return { error: 'Nota não encontrada: ' + notePath }
      }
      const current = await fsp.readFile(resolved, 'utf-8')
      const updated = current.trimEnd() + `\n- [ ] ${taskText}\n`
      await fsp.writeFile(resolved, updated, 'utf-8')
      return { success: true }
    } catch (err) {
      throw new Error(`vault:addTask falhou: ${err.message}`)
    }
  })

  // ── Attachment save ────────────────────────────────────────────────────────

  ipcMain.handle('attachment:save', async (_e, vaultPath, nome, bufferArray) => {
    try {
      validatePath(vaultPath)
      const attachDir = path.join(vaultPath, 'attachments')
      if (!fs.existsSync(attachDir)) {
        await fsp.mkdir(attachDir, { recursive: true })
      }
      const filePath = path.join(attachDir, nome)
      await fsp.writeFile(filePath, Buffer.from(bufferArray))
      return { success: true, filePath }
    } catch (err) {
      throw new Error(`attachment:save falhou: ${err.message}`)
    }
  })
}
