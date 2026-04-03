const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // ── File System ──────────────────────────────────────────────────────────
  readFile: (filePath) =>
    ipcRenderer.invoke('fs:readFile', filePath),

  writeFile: (filePath, content) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  readdir: (dirPath, opts) =>
    ipcRenderer.invoke('fs:readdir', dirPath, opts),

  // Returns absolute paths to all .md files under dirPath (any depth)
  readdirRecursive: (dirPath) =>
    ipcRenderer.invoke('fs:readdirRecursive', dirPath),

  mkdir: (dirPath) =>
    ipcRenderer.invoke('fs:mkdir', dirPath),

  exists: (filePath) =>
    ipcRenderer.invoke('fs:exists', filePath),

  rename: (oldPath, newPath) =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),

  deleteFile: (filePath) =>
    ipcRenderer.invoke('fs:deleteFile', filePath),

  openPath: (filePath) =>
    ipcRenderer.invoke('shell:openPath', filePath),

  // ── Dialog ───────────────────────────────────────────────────────────────
  openFolder: () =>
    ipcRenderer.invoke('dialog:openFolder'),

  // ── Config (vault path + settings) ───────────────────────────────────────
  getConfig: (key) =>
    ipcRenderer.invoke('config:get', key),

  setConfig: (key, value) =>
    ipcRenderer.invoke('config:set', key, value),

  // ── Path utilities ────────────────────────────────────────────────────────
  joinPath: (...parts) =>
    ipcRenderer.invoke('path:join', ...parts),

  sep: process.platform === 'win32' ? '\\' : '/',

  // ── Find in page ─────────────────────────────────────────────────────────────
  findInPage: (text, opts) =>
    ipcRenderer.invoke('find:inPage', text, opts),

  stopFind: () =>
    ipcRenderer.invoke('find:stop'),

  // ── Machine Hemisphere (AI private workspace) ──────────────────────────────
  machineContext: {
    init: (vaultPath) =>
      ipcRenderer.invoke('machine:init', vaultPath),
    readContext: (filePath) =>
      ipcRenderer.invoke('machine:readContext', filePath),
    writeContext: (filePath, content) =>
      ipcRenderer.invoke('machine:writeContext', filePath, content),
    listFiles: (vaultPath) =>
      ipcRenderer.invoke('machine:listFiles', vaultPath),
  },

  // ── AI API Key (safeStorage — OS keychain) ─────────────────────────────────
  ai: {
    saveApiKey: (apiKey) =>
      ipcRenderer.invoke('ai:saveApiKey', apiKey),
    getApiKey: () =>
      ipcRenderer.invoke('ai:getApiKey'),
    deleteApiKey: () =>
      ipcRenderer.invoke('ai:deleteApiKey'),
  },

  // ── Terminal embutido (node-pty) ───────────────────────────────────────────
  terminal: {
    start: (vaultPath) =>
      ipcRenderer.invoke('terminal:start', vaultPath),
    write: (data) =>
      ipcRenderer.invoke('terminal:write', data),
    resize: (cols, rows) =>
      ipcRenderer.invoke('terminal:resize', cols, rows),
    kill: () =>
      ipcRenderer.invoke('terminal:kill'),
    onData: (callback) =>
      ipcRenderer.on('terminal:data', (_e, data) => callback(data)),
    onExit: (callback) =>
      ipcRenderer.on('terminal:exit', (_e, code) => callback(code)),
    offData: () =>
      ipcRenderer.removeAllListeners('terminal:data'),
    offExit: () =>
      ipcRenderer.removeAllListeners('terminal:exit'),
  },
})
