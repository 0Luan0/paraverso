---
paths:
  - "src/components/notas/NoteEditorCM.jsx"
  - "src/lib/attachments.js"
---

# Regras do Editor CodeMirror 6

## Arquitetura
- Markdown puro (nao WYSIWYG)
- Live preview via `hideMarkdownPlugin` — esconde marcadores quando cursor nao esta na linha
- Temas dinamicos via `Compartment` (`temaCompartment.reconfigure()`)
- Syntax highlighting com `HighlightStyle` + `tags.heading1-6`, `tags.strong`, etc.

## Plugins ativos
- `wikilinkPlugin` (decoration) + click em `.cm-wikilink`
- `hashtagPlugin` (decoration `.cm-hashtag`)
- `criarWikilinkCompletion()` — autocomplete `[[`
- `wikilinkKeymap` — auto-close `[[]]`, backspace inteligente
- `hrPlugin` — `---` vira `<hr>` widget
- `taskPlugin` — CheckboxWidget (3 estados: [ ] [x] [/])
- `blockquotePlugin` — borda esquerda accent
- `imageDecorationPlugin` — `![[nome.png]]` vira `<img>` inline
- `pdfDecorationPlugin` — `![[arquivo.pdf]]` vira botao clicavel
- `attachmentPasteExtension` — Ctrl+V com imagem/PDF

## Anexos (fluxo)
```
Ctrl+V → attachmentPasteExtension → gerarNomeAnexo()
→ window.electron.saveAttachment() → IPC attachment:save
→ fs.writeFileSync(vault/attachments/nome) → insere ![[nome]]
```

## Protocol handler `attachment://`
- Registrado em `main.cjs` via `protocol.handle`
- Serve de `vaultPath/attachments/`
- NAO use `file://` — bloqueado pelo Electron em dev

## Save flow (markdown-first)
1. `onConteudoChange` recebe markdown do CodeMirror
2. `atualizarNotaAtiva({ _rawMarkdown: markdown, conteudo: null })`
3. `salvarNotaVault` usa `_rawMarkdown` direto — zero conversao
4. `foiEditadaRef` guard previne save de notas nao editadas

## O que NAO fazer
- Nao modifique `wikilinkPlugin` sem guard `ATTACHMENT_EXTS`
- Nao use HTML intermediario em templates
- Nao substitua vault index por `getTodasNotas()`
- Nao use `invalidateIndex()` com `new Map()`
