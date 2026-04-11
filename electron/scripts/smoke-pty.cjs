// Smoke test: load node-pty inside Electron main process and spawn/kill a shell.
// Exits 0 on success, 1 on failure. Runs via `npx electron smoke-pty.cjs`.
const { app } = require('electron')

app.whenReady().then(() => {
  try {
    const pty = require('node-pty')
    const proc = pty.spawn(process.env.SHELL || '/bin/sh', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    })
    let gotData = false
    proc.onData(() => { gotData = true })
    setTimeout(() => {
      try { proc.kill() } catch {}
      console.log('NODE_PTY_OK gotData=' + gotData)
      app.exit(0)
    }, 500)
  } catch (err) {
    console.log('NODE_PTY_FAIL ' + err.message)
    app.exit(1)
  }
})
