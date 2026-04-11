/**
 * pathGuard — pure security helpers for Electron main process.
 *
 * Used by main.cjs to validate:
 *   1. Attachment filenames before writing or serving via attachment:// protocol
 *   2. External URLs before fetching in browser:scrapeUrl (SSRF defense)
 *
 * All functions are pure — no fs, no electron, no network. Exhaustively
 * unit-tested under ./__tests__/pathGuard.test.mjs.
 */

const path = require('node:path')

/**
 * Returns true if `nome` is a plain filename safe to place inside a
 * base directory (no traversal, no separators, no absolute paths).
 */
function isSafeAttachmentName(nome) {
  if (typeof nome !== 'string' || nome.length === 0) return false
  if (nome.includes('\0')) return false
  if (nome.includes('/') || nome.includes('\\')) return false
  if (nome === '..' || nome === '.') return false
  if (nome.split(/[\\/]/).some(seg => seg === '..' || seg === '.')) return false
  if (path.isAbsolute(nome)) return false
  // Defensive: reject windows drive letters even on unix
  if (/^[a-zA-Z]:/.test(nome)) return false
  return true
}

/**
 * Resolves `input` relative to `base` and returns the absolute path
 * ONLY if it stays within base. Returns null otherwise.
 *
 * Both absolute and relative inputs are supported — absolute inputs are
 * accepted only when they already resolve inside base.
 */
function resolveWithinBase(base, input) {
  if (typeof base !== 'string' || base.length === 0) return null
  if (typeof input !== 'string' || input.length === 0) return null
  const resolvedBase = path.resolve(base)
  const resolvedInput = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(resolvedBase, input)
  if (
    resolvedInput === resolvedBase ||
    resolvedInput.startsWith(resolvedBase + path.sep)
  ) {
    return resolvedInput
  }
  return null
}

/**
 * Returns true if `url` is a public http(s) URL safe to fetch from the
 * main process without risking SSRF / local resource exfiltration.
 *
 * Blocks: non-http(s) schemes, loopback, RFC1918 private networks,
 * link-local (incl. cloud metadata 169.254.169.254), 0.0.0.0, empty host.
 */
function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

  // Normalize hostname (strip brackets from IPv6, lowercase)
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host.length === 0) return false
  if (host === 'localhost') return false
  if (host === '0.0.0.0') return false
  if (host === '::1' || host === '::' || host.startsWith('::ffff:127.')) return false

  // IPv4 numeric checks
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 127) return false                       // loopback
    if (a === 10) return false                        // RFC1918
    if (a === 192 && b === 168) return false          // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false // RFC1918
    if (a === 169 && b === 254) return false          // link-local + cloud metadata
    if (a === 0) return false                         // 0.0.0.0/8
  }

  return true
}

module.exports = { isSafeAttachmentName, resolveWithinBase, isSafeExternalUrl }
