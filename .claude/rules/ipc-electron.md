---
paths:
  - "electron/main.cjs"
  - "electron/preload.cjs"
---

# IPC e Electron (main.cjs ↔ renderer)

## Canais IPC (via window.electron)
- `fs:readFile`, `fs:writeFile`, `fs:deleteFile`, `fs:exists`
- `fs:readdir` (com opcao `{ dirsOnly: true }`)
- `fs:readdirRecursive`, `fs:mkdir`, `fs:joinPath`
- `dialog:openFolder`
- `attachment:save` — salva buffer de imagem/PDF em `vault/attachments/`

## Protocol handler `attachment://`
- Registrado em `main.cjs` via `protocol.handle('attachment', ...)`
- Serve arquivos de `vaultPath/attachments/`
- Necessario porque `file://` e bloqueado pelo Electron em renderers rodando em localhost

## Formatos de arquivo suportados
- **Paraverso nativo** (tem `id:` no frontmatter YAML)
- **Plain markdown** (sem frontmatter) — importado do Obsidian
- **Obsidian YAML** (frontmatter sem `id:`) — convertido ao salvar

## NFD/NFC (macOS critical)
Toda comparacao de path usa `.normalize('NFC')`. Ver `_topDir()` em vaultFs.js.
