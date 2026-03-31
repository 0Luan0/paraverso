const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // barra nativa macOS com botões de fechar/minimizar
    backgroundColor: '#1A1812',   // evita flash branco ao abrir
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    // ícone (adicionar depois)
    // icon: path.join(__dirname, '../public/icon.png'),
  })

  if (isDev) {
    // modo desenvolvimento: carrega o servidor Vite
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // modo produção: carrega o build estático
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // links externos abrem no navegador, não dentro do app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  // macOS: reabrir janela ao clicar no ícone do Dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// fechar app ao fechar última janela (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
