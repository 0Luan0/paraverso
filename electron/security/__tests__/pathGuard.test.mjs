/**
 * pathGuard — pure security helpers for Electron main process.
 *
 * Tests run via vitest. Source lives as CJS (.cjs) because main.cjs
 * require()s it; tests use ESM import + Node's CJS interop.
 */

import path from 'node:path'
import { describe, it, expect } from 'vitest'
import pathGuard from '../pathGuard.cjs'

const { isSafeAttachmentName, resolveWithinBase, isSafeExternalUrl } = pathGuard

describe('isSafeAttachmentName', () => {
  it('accepts plain filenames', () => {
    expect(isSafeAttachmentName('image.png')).toBe(true)
    expect(isSafeAttachmentName('doc with spaces.pdf')).toBe(true)
    expect(isSafeAttachmentName('2026-04-11 12.34.56.jpg')).toBe(true)
    expect(isSafeAttachmentName('arquivo-com-acentos-ção.png')).toBe(true)
  })

  it('rejects empty and non-strings', () => {
    expect(isSafeAttachmentName('')).toBe(false)
    expect(isSafeAttachmentName(null)).toBe(false)
    expect(isSafeAttachmentName(undefined)).toBe(false)
    expect(isSafeAttachmentName(42)).toBe(false)
    expect(isSafeAttachmentName({})).toBe(false)
  })

  it('rejects path traversal via ..', () => {
    expect(isSafeAttachmentName('..')).toBe(false)
    expect(isSafeAttachmentName('../etc/passwd')).toBe(false)
    expect(isSafeAttachmentName('..\\etc\\passwd')).toBe(false)
    expect(isSafeAttachmentName('foo/../bar.png')).toBe(false)
    expect(isSafeAttachmentName('foo/..')).toBe(false)
  })

  it('rejects directory separators', () => {
    expect(isSafeAttachmentName('sub/file.png')).toBe(false)
    expect(isSafeAttachmentName('sub\\file.png')).toBe(false)
    expect(isSafeAttachmentName('/absolute.png')).toBe(false)
    expect(isSafeAttachmentName('\\absolute.png')).toBe(false)
  })

  it('rejects absolute paths (unix + windows)', () => {
    expect(isSafeAttachmentName('/etc/passwd')).toBe(false)
    expect(isSafeAttachmentName('C:\\Windows\\System32\\cmd.exe')).toBe(false)
    expect(isSafeAttachmentName('C:/Windows/file.png')).toBe(false)
  })

  it('rejects null bytes (defensive)', () => {
    expect(isSafeAttachmentName('foo\0.png')).toBe(false)
  })
})

describe('resolveWithinBase', () => {
  const BASE = path.resolve('/tmp/vault/attachments')

  it('resolves safe names within base', () => {
    const result = resolveWithinBase(BASE, 'image.png')
    expect(result).toBe(path.join(BASE, 'image.png'))
  })

  it('returns null when input escapes base via ..', () => {
    expect(resolveWithinBase(BASE, '../../../etc/passwd')).toBe(null)
    expect(resolveWithinBase(BASE, '..')).toBe(null)
  })

  it('returns null for absolute path outside base', () => {
    expect(resolveWithinBase(BASE, '/etc/passwd')).toBe(null)
    expect(resolveWithinBase(BASE, path.resolve('/other/dir/file.png'))).toBe(null)
  })

  it('accepts absolute path exactly inside base (belt + suspenders)', () => {
    const inside = path.join(BASE, 'nested', 'ok.png')
    expect(resolveWithinBase(BASE, inside)).toBe(inside)
  })

  it('returns null for empty / non-string input', () => {
    expect(resolveWithinBase(BASE, '')).toBe(null)
    expect(resolveWithinBase(BASE, null)).toBe(null)
    expect(resolveWithinBase(BASE, undefined)).toBe(null)
  })
})

describe('isSafeExternalUrl', () => {
  it('accepts public http(s) URLs', () => {
    expect(isSafeExternalUrl('https://example.com/article')).toBe(true)
    expect(isSafeExternalUrl('http://news.ycombinator.com')).toBe(true)
    expect(isSafeExternalUrl('https://en.wikipedia.org/wiki/Electron')).toBe(true)
  })

  it('rejects invalid / non-string / empty', () => {
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })

  it('rejects non-http(s) schemes', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('ftp://example.com/foo')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeExternalUrl('gopher://example.com')).toBe(false)
  })

  it('rejects loopback hosts', () => {
    expect(isSafeExternalUrl('http://localhost')).toBe(false)
    expect(isSafeExternalUrl('http://localhost:8080')).toBe(false)
    expect(isSafeExternalUrl('http://127.0.0.1')).toBe(false)
    expect(isSafeExternalUrl('http://127.5.3.7/')).toBe(false)
    expect(isSafeExternalUrl('http://[::1]/')).toBe(false)
  })

  it('rejects RFC1918 private networks', () => {
    expect(isSafeExternalUrl('http://10.0.0.5/')).toBe(false)
    expect(isSafeExternalUrl('http://192.168.1.1/')).toBe(false)
    expect(isSafeExternalUrl('http://172.16.0.1/')).toBe(false)
    expect(isSafeExternalUrl('http://172.31.255.254/')).toBe(false)
  })

  it('accepts 172.x outside RFC1918 range', () => {
    expect(isSafeExternalUrl('http://172.15.0.1/')).toBe(true)
    expect(isSafeExternalUrl('http://172.32.0.1/')).toBe(true)
  })

  it('rejects link-local and cloud metadata', () => {
    expect(isSafeExternalUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    expect(isSafeExternalUrl('http://169.254.0.1/')).toBe(false)
  })

  it('rejects 0.0.0.0', () => {
    expect(isSafeExternalUrl('http://0.0.0.0/')).toBe(false)
  })
})
