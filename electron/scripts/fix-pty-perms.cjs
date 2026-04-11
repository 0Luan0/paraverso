/**
 * fix-pty-perms — restore +x on node-pty prebuilt spawn-helper binaries.
 *
 * npm strips execute bits from some tarball entries during install, which
 * breaks `pty.spawn()` at runtime with "posix_spawnp failed". Run as a
 * postinstall hook so the fix is applied after every `npm install`.
 *
 * No-op on Windows (spawn-helper is unix-only).
 */
const fs = require('node:fs')
const path = require('node:path')

if (process.platform === 'win32') process.exit(0)

const prebuildsDir = path.join(__dirname, '..', '..', 'node_modules', 'node-pty', 'prebuilds')
if (!fs.existsSync(prebuildsDir)) {
  // node-pty not installed (e.g. running before install). Silent exit.
  process.exit(0)
}

let fixed = 0
for (const entry of fs.readdirSync(prebuildsDir)) {
  const helper = path.join(prebuildsDir, entry, 'spawn-helper')
  if (fs.existsSync(helper)) {
    try {
      fs.chmodSync(helper, 0o755)
      fixed++
    } catch (err) {
      console.warn(`[fix-pty-perms] failed on ${helper}: ${err.message}`)
    }
  }
}
if (fixed > 0) console.log(`[fix-pty-perms] chmod +x on ${fixed} spawn-helper binaries`)
