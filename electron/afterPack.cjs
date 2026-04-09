const { execSync } = require('child_process')

/**
 * afterPack hook — strips macOS extended attributes (resource forks, quarantine)
 * from the packaged app. Without this, codesign fails with
 * "resource fork, Finder information, or similar detritus not allowed".
 */
exports.default = async function (context) {
  if (process.platform !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log(`[afterPack] Stripping extended attributes from ${appPath}`)
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
  } catch (err) {
    console.warn('[afterPack] xattr -cr failed:', err.message)
  }
}
