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
})
