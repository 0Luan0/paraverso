/**
 * attachments.js — Pure utility functions for attachment names and paths.
 */

export function gerarNomeAnexo(ext, date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  const ts =
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  return `Pasted image ${ts}.${ext}`
}

export function resolverPathAnexo(vaultPath, nomeArquivo) {
  return `${vaultPath}/attachments/${nomeArquivo}`
}

export function extDeMimeType(mimeType) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  }
  return map[mimeType] ?? 'bin'
}
