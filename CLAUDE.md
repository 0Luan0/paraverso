# Paraverso — Contexto para Claude Code

## O que é
App desktop Electron + React chamado **Paraverso** — caderno digital estilo Obsidian.
Desktop-first. Stack: Electron 36, React 19 + Vite 8, Tailwind CSS 3, **CodeMirror 6** (editor), d3-force (grafo), Dexie.js (IndexedDB), Supabase (futuro).

## Como rodar
```bash
npm run dev            # Vite (frontend) — porta 5173
npm run electron:dev   # Vite + Electron juntos
```

## Estrutura principal
```
electron/
  main.cjs       — processo principal Electron + IPC handlers
  preload.cjs    — contextBridge (window.electron)

src/
  App.jsx                          — layout principal, 3 abas (Mês, Notas, Grafo, Config)
  db/index.js                      — camada de dados unificada (Dexie ou vault)
  lib/
    vaultFs.js                     — operações de arquivo no vault (leitura/escrita/mover notas)
    markdownUtils.js               — Markdown ↔ TipTap JSON (legado, usado no save fallback)
    templateUtils.js               — resolução de variáveis de template ({{date}}, {{Title}})
    obsidianThemeParser.js         — parser de temas Obsidian (CSS e JSON)
  hooks/
    useTheme.js                    — dark/light mode + aplicação de CSS vars
    useTexture.js                  — texturas de fundo (dots/grid)
  contexts/VaultContext.jsx        — path do vault selecionado
  components/
    notas/
      NotasTab.jsx                 — orquestrador principal das notas (921 linhas)
      NoteEditorCM.jsx             — editor CodeMirror 6 com live preview
      NotesSidebar.jsx             — sidebar (cadernos + busca + drag&drop)
      TemplateModal.jsx            — templates de nota (Cmd+T)
    mes/
      MesTab.jsx                   — ✅ FUNCIONANDO — aba mês (não mexa!)
    placeholders/
      GraphTab.jsx                 — graph view SVG + d3-force (926 linhas)
    layout/
      TopBar.jsx                   — barra superior (logo + tema + textura)
      NavTabs.jsx                  — abas de navegação (Mês/Notas/Grafo/Config)
    QuickSwitcher.jsx              — Cmd+O para abrir/criar notas
    config/
      ConfigTab.jsx                — configurações + importação Obsidian + aparência/temas
```

## Editor (CodeMirror 6) — Migrado de TipTap

O editor usa CodeMirror 6 com markdown puro (não WYSIWYG). Features:

- **Live Preview**: `hideMarkdownPlugin` esconde `**`, `*`, `~~`, `#`, `` ` ``, `>` quando cursor não está na linha
- **Syntax highlighting**: `HighlightStyle` com `tags.heading1-6`, `tags.strong`, `tags.emphasis`, etc.
- **Tema dinâmico**: `Compartment` permite hot-swap de cores via `temaCompartment.reconfigure()`
- **Wikilinks**: `wikilinkPlugin` (decoration) + click handler via DOM `classList.contains('cm-wikilink')`
- **Hashtags**: `hashtagPlugin` (decoration com `.cm-hashtag`)
- **Autocomplete [[**: `criarWikilinkCompletion()` com `@codemirror/autocomplete`
- **Auto-close [[**: `wikilinkKeymap` insere `[[]]` ao digitar segundo `[`
- **Backspace inteligente**: `[[]]` apaga os 4 chars juntos
- **HR visual**: `hrPlugin` renderiza `---` como `<hr>` widget
- **Tasks**: `taskPlugin` com `CheckboxWidget` (3 estados: [ ] [x] [/])
- **Blockquote**: `blockquotePlugin` com borda esquerda accent

### Save flow (markdown-first, sem round-trip)
1. `onConteudoChange` recebe markdown string do CodeMirror
2. `atualizarNotaAtiva({ _rawMarkdown: markdown, conteudo: null })`
3. `salvarNotaVault` usa `_rawMarkdown` diretamente — zero conversão TipTap
4. `foiEditadaRef` guard previne save de notas não editadas

### Tema dinâmico do editor
```js
// Lê CSS vars em runtime
getCoresDoTema() → { h1, h2, bold, italic, link, tag, codeBg, ... }

// Cria tema com cores atuais
criarTemaEditor(cores) → [syntaxHighlighting(...), EditorView.theme({...})]

// Hot-swap via Compartment
temaCompartment.reconfigure(criarTemaEditor(getCoresDoTema()))

// Escuta mudanças de tema
window.addEventListener('paraverso:tema-changed', handler)
```

## Sistema de temas

### CSS Variables (index.css → :root)
```
--theme-bg, --theme-sidebar-bg, --theme-sidebar-hover, --theme-sidebar-active
--theme-border, --theme-text, --theme-text-muted, --theme-accent
--editor-h1..h4, --editor-bold, --editor-italic, --editor-link, --editor-tag, --editor-code-bg
```

### Fluxo de aplicação
1. `useTheme.js` aplica vars base (dark/light) via `setProperty`
2. Tema customizado do `localStorage('paraverso-tema-custom')` sobrescreve por cima
3. Componentes usam classes `paraverso-sidebar`, `paraverso-topbar`, etc. com `!important`
4. App.jsx root divs usam `style={{ backgroundColor: 'var(--theme-bg)' }}` inline
5. Importar tema → `setProperty` → dispatch `paraverso:tema-changed` → CM reconfigura

### Parser de temas (obsidianThemeParser.js)
Suporta 3 formatos:
- **Catppuccin/AnuPpuccin**: detecta `--ctp-base`, extrai paleta RGB dos fallbacks
- **Obsidian padrão**: extrai de `.theme-dark` / `:root`
- **Style Settings JSON**: mapeia chaves `Editor@@h1-color@@dark`

## Graph View (SVG + d3-force)

- SVG puro (sem React Flow) — zero conflito de coordenadas
- d3-zoom para pan/zoom, d3-drag para arrastar nós
- `getNotasParaGrafoVault()` com `Promise.all` para leitura paralela
- Wikilinks pré-extraídos no vault scan (não faz round-trip)
- Grupos de cor customizáveis com autocomplete de cadernos
- Force simulation: forceLink, forceManyBody, forceX, forceY, forceCollide
- Hover highlight com transições suaves (d3 transitions)
- Config panel colapsável (nós, arestas, física, exibição, grupos)

## Arquitetura de notas

### Vault Index (em memória)
```js
// Map<titulo_normalizado_NFC_lowercase, metadata>
vaultIndexRef.current.get('nome da nota') // → { id, titulo, caderno, _filename }
```

### Navegação com histórico
- `history = ['id1', 'id2', 'id3']` — array de IDs
- `goBack()`/`goForward()` — busca nota por ID, suporta cross-caderno
- `navigarPara(nota)` — push ID ao history, incrementa `navKey` para remount

### Formatos de arquivo suportados
- **Paraverso nativo** (tem `id:` no frontmatter YAML) — formato primário
- **Plain markdown** (sem frontmatter) — importado do Obsidian
- **Obsidian YAML** (frontmatter sem `id:`) — convertido ao salvar

### NFD/NFC (macOS critical)
Toda comparação de path usa `.normalize('NFC')`. Ver `_topDir()` em vaultFs.js.

## Sidebar

- Cadernos com subpastas expansíveis
- Busca inline com prefixes: `path:`, `file:`, `tag:`
- Drag & drop para mover notas entre cadernos (`moverNotaVault`)
- Pastas e subpastas iniciam fechadas
- `notasPorCaderno` cache — expandir pasta carrega notas sem mudar caderno ativo
- Chevron `>` só expande/recolhe — nome do caderno seleciona

## Templates

- Leitura direta de `.md` na pasta templates do vault
- Inserção via `markdownParaTipTapJson` → `insertContent` no CodeMirror
- Variáveis: `{{date}}`, `{{time}}`, `{{Title}}`, `{{title}}`
- Gerenciador de templates inline no ConfigTab
- Pasta templates filtrada da sidebar de notas

## IPC (main.cjs ↔ renderer via window.electron)
- `fs:readFile`, `fs:writeFile`, `fs:deleteFile`, `fs:exists`
- `fs:readdir` (com opção `{ dirsOnly: true }`)
- `fs:readdirRecursive`, `fs:mkdir`, `fs:joinPath`
- `dialog:openFolder`

## O que NÃO fazer
- **Não mexa na Aba Mês** (`MesTab.jsx` e arquivos em `mes/`)
- **Não substitua o vault index** por `getTodasNotas()` — era causa raiz de bugs
- **Não use `invalidateIndex()` com `new Map()`** — limpar o mapa mata o autocomplete
- **Não adicione `.dark` CSS vars no index.css** — `useTheme.js` gerencia via JS
- **Não use HTML intermediário em templates** — markdown → TipTap JSON direto

## Status das features

| Feature | Status | Notas |
|---|---|---|
| Aba Mês | ✅ Funcionando | NÃO MEXA |
| Editor CodeMirror 6 | ✅ Funcionando | Live preview, temas dinâmicos |
| Graph View (d3-force) | ✅ Funcionando | SVG + zoom/drag + grupos de cor |
| Wikilinks [[nota]] | ✅ Funcionando | Click em `.cm-wikilink`, autocomplete |
| Backlinks | ✅ Funcionando | Painel no rodapé do editor |
| QuickSwitcher (Cmd+O) | ✅ Funcionando | Criar nota se não existe |
| Busca na sidebar | ✅ Funcionando | Lupa + prefixes path:/file:/tag: |
| Importação Obsidian | ✅ Funcionando | Preserva subpastas e IDs |
| Templates | ✅ Funcionando | Gerenciador no ConfigTab |
| Sistema de temas | ✅ Funcionando | CSS vars + parser Obsidian/Catppuccin |
| Dark/Light toggle | ✅ Funcionando | Via CSS vars (useTheme.js) |
| Drag & drop notas | ✅ Funcionando | Mover entre cadernos |
| Autosave | ✅ Funcionando | Debounce 700ms + flush no unmount |
| Nomes únicos | ✅ Funcionando | "Sem título 2", "Sem título 3" |
| Sync Supabase | ❌ Fase 3 | |

## Branches
- `main` — branch ativa de desenvolvimento
- `backup-tiptap` — snapshot antes da migração TipTap → CodeMirror
