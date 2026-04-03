const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const fsp = fs.promises
const os = require('os')

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

      if (!existed) {
        // Create directory structure
        await fsp.mkdir(path.join(machinePath, 'contexts'), { recursive: true })
        await fsp.mkdir(path.join(machinePath, 'templates'), { recursive: true })

        // Create initial files
        const now = new Date().toISOString()

        const files = {
          'contexts/pessoa.md': [
            '---',
            'type: machine-context',
            'subtype: pessoa',
            'version: 1',
            `updated: ${now}`,
            '---',
            '',
            '# Contexto — Pessoa',
            '',
            '## Estilo de comunicação',
            '[A IA preencherá com o tempo]',
            '',
            '## Interesses gerais',
            '[A IA preencherá com o tempo]',
            '',
            '## Forma de pensar',
            '[A IA preencherá com o tempo]',
            '',
            '## Notas da IA',
            '[A IA preencherá com o tempo]',
            '',
          ].join('\n'),

          'contexts/interesses.md': [
            '---',
            'type: machine-context',
            'subtype: interesses',
            'version: 1',
            `updated: ${now}`,
            '---',
            '',
            '# Contexto — Interesses e Referências',
            '',
            '## Livros lidos / referências',
            '[A IA preencherá com o tempo]',
            '',
            '## Autores e pensadores',
            '[A IA preencherá com o tempo]',
            '',
            '## Áreas de interesse',
            '[A IA preencherá com o tempo]',
            '',
          ].join('\n'),

          'templates/pesquise.md': [
            '---',
            'type: machine-template',
            'command: pesquise',
            '---',
            '',
            '# Template — Pesquisa Web',
            '',
            'Você é um assistente de pesquisa. Ao receber uma solicitação:',
            '',
            '1. Pesquise o tema solicitado',
            '2. Leia o contexto em pessoa.md e interesses.md',
            '3. Escreva um resumo que conecte o tema com os interesses da pessoa',
            '4. Use a forma de comunicação descrita no contexto',
            '5. Sugira conexões com referências que a pessoa já conhece',
            '',
            'Formato de saída: título, resumo (3-5 parágrafos), conexões com interesses, fontes.',
            '',
          ].join('\n'),

          'templates/brainstorm.md': [
            '---',
            'type: machine-template',
            'command: brainstorm',
            '---',
            '',
            '# Template — Brainstorm',
            '',
            'Você é um parceiro de brainstorm criativo. Ao receber um tema:',
            '',
            '1. Leia o contexto em pessoa.md e interesses.md',
            '2. Gere ideias que conectem o tema com os interesses da pessoa',
            '3. Use referências que a pessoa já conhece como ponto de partida',
            '4. Proponha ângulos não-óbvios e conexões interdisciplinares',
            '5. Organize as ideias em clusters temáticos',
            '',
            'Formato de saída: tema central, ideias agrupadas, conexões surpreendentes, próximos passos.',
            '',
          ].join('\n'),

          'templates/escrita.md': [
            '---',
            'type: machine-template',
            'command: escrita',
            '---',
            '',
            '# Template — Assistente de Escrita',
            '',
            'Você é um assistente de escrita. Ao receber uma solicitação:',
            '',
            '1. Leia o contexto em pessoa.md e interesses.md',
            '2. Adapte o tom ao estilo de comunicação da pessoa',
            '3. Use referências e vocabulário familiares ao autor',
            '4. Mantenha a voz autêntica — ajude a expressar, não substitua',
            '5. Sugira melhorias estruturais e de clareza',
            '',
            'Formato de saída: texto revisado, notas sobre alterações, sugestões opcionais.',
            '',
          ].join('\n'),

          'README.md': [
            '# Hemisfério Máquina',
            '',
            'Esta pasta é gerenciada pela IA do Paraverso.',
            'Não edite manualmente a menos que saiba o que está fazendo.',
            'Os arquivos aqui são o "cérebro" da IA — contexto sobre você, templates de resposta.',
            '',
          ].join('\n'),
        }

        for (const [relPath, content] of Object.entries(files)) {
          const fullPath = path.join(machinePath, relPath)
          await fsp.writeFile(fullPath, content, 'utf-8')
        }
      }

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

  // ── API Key (safeStorage — OS keychain via Electron) ───────────────────────

  const { safeStorage } = require('electron')

  function getApiKeyPath() {
    return path.join(app.getPath('userData'), '.ai-key')
  }

  ipcMain.handle('ai:saveApiKey', async (_e, apiKey) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Encryption not available on this system')
      }
      const encrypted = safeStorage.encryptString(apiKey)
      await fsp.writeFile(getApiKeyPath(), encrypted)
      return { success: true }
    } catch (err) {
      throw new Error(`ai:saveApiKey falhou: ${err.message}`)
    }
  })

  ipcMain.handle('ai:getApiKey', async () => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      const keyPath = getApiKeyPath()
      try { await fsp.access(keyPath) } catch { return null }
      const encrypted = await fsp.readFile(keyPath)
      return safeStorage.decryptString(encrypted)
    } catch {
      return null
    }
  })

  ipcMain.handle('ai:deleteApiKey', async () => {
    try {
      const keyPath = getApiKeyPath()
      try { await fsp.unlink(keyPath) } catch {}
      return { success: true }
    } catch (err) {
      throw new Error(`ai:deleteApiKey falhou: ${err.message}`)
    }
  })

  // ── Terminal embutido (shell + claude) ──────────────────────────────────────
  // Architecture: spawn a real interactive shell (zsh/bash), then write the
  // claude command into it. The shell stays alive because it's a real
  // interactive process — no SIGHUP issues, no terminal capability queries.
  // This is the same pattern used by obsidian-terminal.

  const pty = require('node-pty-prebuilt-multiarch')

  let ptyProcess = null

  ipcMain.handle('terminal:start', async (event, vaultPath) => {
    try {
      if (ptyProcess) {
        try { ptyProcess.kill() } catch {}
        ptyProcess = null
        await new Promise(r => setTimeout(r, 200))
      }

      // Generate MCP config pointing to vault
      const mcpConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', vaultPath],
          },
        },
      }
      const mcpConfigPath = path.join(os.tmpdir(), 'paraverso-mcp-config.json')
      fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2))

      // Spawn a real interactive shell — same pattern as obsidian-terminal.
      // The shell stays alive; we write the claude command into it.
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
        console.log('[PTY EXIT] code:', exitCode)
        if (!webContents.isDestroyed()) {
          webContents.send('terminal:exit', exitCode)
        }
        ptyProcess = null
      })

      // Wait for shell to initialize, then send claude command
      setTimeout(() => {
        if (ptyProcess) {
          ptyProcess.write(`claude --mcp-config "${mcpConfigPath}" --dangerously-skip-permissions\r`)
        }
      }, 1000)

      return { success: true, mcpConfigPath }
    } catch (err) {
      throw new Error(`terminal:start falhou: ${err.message}`)
    }
  })

  ipcMain.handle('terminal:write', (_e, data) => {
    if (ptyProcess) ptyProcess.write(data)
  })

  ipcMain.handle('terminal:resize', (_e, cols, rows) => {
    if (ptyProcess) {
      try { ptyProcess.resize(cols, rows) } catch {}
    }
  })

  ipcMain.handle('terminal:kill', () => {
    if (ptyProcess) {
      try { ptyProcess.kill() } catch {}
      ptyProcess = null
    }
  })
}
