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
  App.jsx                          — layout principal (Mês, Notas, Grafo, Config)
  db/index.js                      — camada de dados unificada (passthrough para vaultFs)
  lib/
    vaultFs.js                     — operações de arquivo no vault (leitura/escrita/mover notas)
    markdownUtils.js               — utilitários markdown (contarPalavras, formatarData)
    templateUtils.js               — resolução de variáveis de template ({{date}}, {{Title}})
    mesUtils.js                    — utilitários de data/mês (formatarMes, mesAtual, semanaDoAno)
    attachments.js                 — gerarNomeAnexo, resolverPathAnexo, extDeMimeType
    graphColors.js                 — corPorCaderno() hash → paleta automática estilo Obsidian
    graphHemisphere.js             — mergeGraphNodes(), hemisphereTargetX() para grafo hemisférico
    obsidianThemeParser.js         — parser de temas Obsidian (CSS e JSON)
  hooks/
    useTheme.js                    — dark/light mode + aplicação de CSS vars
    useTexture.js                  — texturas de fundo (dots/grid) — usado no editor + ConfigTab
    useSidebarResize.js            — resize da sidebar por drag
  contexts/VaultContext.jsx        — path do vault selecionado
  components/
    notas/
      NotasTab.jsx                 — orquestrador principal das notas (921 linhas)
      NoteEditorCM.jsx             — editor CodeMirror 6 com live preview + anexos
      NotesSidebar.jsx             — sidebar (cadernos + busca + drag&drop)
      TemplateModal.jsx            — templates de nota (Cmd+T)
    mes/
      MesTab.jsx                   — ✅ FUNCIONANDO — aba mês (não mexa!)
    placeholders/
      GraphTab.jsx                 — graph view SVG + d3-force com hemisférios
    layout/
      TopBar.jsx                   — barra superior (logo + tema + textura)
      NavTabs.jsx                  — abas de navegação (Mês/Notas/Grafo/Config)
    QuickSwitcher.jsx              — Cmd+O — busca em todas as notas (humanas + máquina)
    config/
      ConfigTab.jsx                — configurações + importação Obsidian + aparência/temas
```

## Os dois hemisférios do vault

O vault tem dois hemisférios com regras distintas:

| Hemisfério | Pasta | Acesso IA | Visível na sidebar |
|---|---|---|---|
| Humano | tudo exceto `_machine/` | ❌ nunca | ✅ sim |
| Máquina | `_machine/` | ✅ total | ❌ não |

### Regra crítica — RESERVED_DIRS
`_machine/` está em `RESERVED_DIRS` em `vaultFs.js`. Isso faz com que `_getAllMdPaths()` nunca retorne arquivos de `_machine/`. **Isso é intencional** — remove `_machine` de:
- Sidebar de notas
- Graph view (notas humanas)
- Backlinks
- Busca

Para incluir notas de `_machine` onde necessário (QuickSwitcher, graph hemisférico), use o padrão de merge:
```javascript
// Padrão correto — NÃO modifique RESERVED_DIRS
const humanas = await getTodasNotasMetadata()           // sem _machine
const maquina = await window.electron.machineContext.listFiles(vaultPath)  // só _machine
const todas = [...humanas.map(n => ({...n, hemisphere: 'human'})),
               ...maquina.map(e => ({...e, hemisphere: 'machine'}))]
```

Este padrão já está implementado em:
- `QuickSwitcher.jsx` — hook `useQuickSwitcherNotas`
- `GraphTab.jsx` — merge antes de montar `simNodes`

## Editor (CodeMirror 6)

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
- **Imagens inline**: `imageDecorationPlugin` renderiza `![[nome.png]]` como `<img>` (live preview)
- **PDF inline**: `pdfDecorationPlugin` renderiza `![[arquivo.pdf]]` como botão clicável
- **Paste de anexos**: `attachmentPasteExtension` captura Ctrl+V com imagem/PDF → salva em `attachments/` → insere `![[nome]]`

### Anexos (imagens e PDFs)
```
Fluxo de paste:
  Ctrl+V com imagem/PDF no clipboard
  → attachmentPasteExtension (CodeMirror domEventHandler)
  → gerarNomeAnexo() → "Pasted image 20260403101943.png"
  → window.electron.saveAttachment(vaultPath, nome, buffer)
  → IPC attachment:save → fs.writeFileSync(vault/attachments/nome)
  → insere ![[nome]] no cursor

Fluxo de render:
  imageDecorationPlugin detecta ![[*.png|jpg|gif|webp]]
  → ImageWidget.toDOM() → <img src="attachment://nome">
  → protocol handler 'attachment://' serve de vault/attachments/
  → só renderiza quando cursor NÃO está na linha (live preview)
```

### Protocol handler `attachment://`
Registrado em `main.cjs` via `protocol.handle('attachment', ...)`. Serve arquivos de `vaultPath/attachments/`. Necessário porque `file://` é bloqueado pelo Electron em renderers rodando em `localhost`.

### Save flow (markdown-first, sem round-trip)
1. `onConteudoChange` recebe markdown string do CodeMirror
2. `atualizarNotaAtiva({ _rawMarkdown: markdown, conteudo: null })`
3. `salvarNotaVault` usa `_rawMarkdown` diretamente — zero conversão TipTap
4. `foiEditadaRef` guard previne save de notas não editadas

### Tema dinâmico do editor
```js
getCoresDoTema() → { h1, h2, bold, italic, link, tag, codeBg, ... }
criarTemaEditor(cores) → [syntaxHighlighting(...), EditorView.theme({...})]
temaCompartment.reconfigure(criarTemaEditor(getCoresDoTema()))
window.addEventListener('paraverso:tema-changed', handler)
```

## QuickSwitcher (Cmd+O)

Estágio único — mostra todas as notas do vault (humanas + máquina) em uma lista unificada.

- Notas humanas: cor padrão + nome do caderno
- Notas de `_machine`: badge roxo `⚙️ máquina`
- Busca por título, caderno e relativePath
- `Backspace` com input vazio fecha o switcher
- "Criar nota" só disponível para hemisfério humano
- Dados: `useQuickSwitcherNotas(machineContext)` — merge no mount, sem IPC extra

## Graph View (SVG + d3-force)

- SVG puro (sem React Flow) — zero conflito de coordenadas
- d3-zoom para pan/zoom, d3-drag para arrastar nós
- **Cores automáticas por caderno**: `corPorCaderno()` em `graphColors.js` — hash determinístico → paleta de 8 cores estilo Obsidian. Grupos customizados têm prioridade.
- **Hemisférios visuais**: divisor central fixo (fora do grupo de zoom), labels "hemisfério humano" / "hemisfério máquina"
- **Nós de `_machine`**: roxo fixo `#a855f7`, carregados via `machineContext.listFiles()` e merged
- **Força hemisférica**: `forceX` com target `±(width * 0.22)` por hemisfério, strength `0.12`
- Arestas cruzam o divisor livremente quando nota humana linka nota máquina
- Hover highlight com transições suaves
- Config panel colapsável (nós, arestas, física, exibição, grupos)

### Arquitetura do SVG
```
<svg>
  <g class="brain-decoration-fixed">   ← FORA do zoom — fixo na tela
    divisor central, labels hemisférios
  </g>
  <g ref={zoomGroupRef}>               ← DENTRO do zoom — se move com pan/zoom
    links, nós, labels
  </g>
</svg>
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

## Arquitetura de notas

### Vault Index (em memória)
```js
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
- `_machine/` nunca aparece aqui — filtrada por `RESERVED_DIRS`

## Templates

- Leitura direta de `.md` na pasta templates do vault
- Variáveis: `{{date}}`, `{{time}}`, `{{Title}}`, `{{title}}`
- Gerenciador de templates inline no ConfigTab
- Pasta templates filtrada da sidebar de notas

## IPC (main.cjs ↔ renderer via window.electron)
- `fs:readFile`, `fs:writeFile`, `fs:deleteFile`, `fs:exists`
- `fs:readdir` (com opção `{ dirsOnly: true }`)
- `fs:readdirRecursive`, `fs:mkdir`, `fs:joinPath`
- `dialog:openFolder`
- `attachment:save` — salva buffer de imagem/PDF em `vault/attachments/`
- Protocol `attachment://` — serve arquivos de `vault/attachments/` (bypassa bloqueio file://)

## db/index.js — passthrough

`db/index.js` é uma camada de passthrough puro para `vaultFs.js`:
```javascript
export const getNota = (id) => vaultFs.getNotaVault(id)
// ...8 funções no mesmo padrão
```
Existe por razões históricas (havia lógica Dexie aqui). **Não consolidar ainda** — 12 arquivos dependem desse import. Dívida técnica conhecida para sprint futuro.

## O que NÃO fazer

- **Não mexa na Aba Mês** (`MesTab.jsx` e arquivos em `mes/`)
- **Não remova `_machine` de `RESERVED_DIRS`** — quebra sidebar, backlinks, busca, graph
- **Não use `file://` para servir anexos** — bloqueado pelo Electron em dev. Use `attachment://`
- **Não substitua o vault index** por `getTodasNotas()` — era causa raiz de bugs
- **Não use `invalidateIndex()` com `new Map()`** — limpar o mapa mata o autocomplete
- **Não adicione `.dark` CSS vars no index.css** — `useTheme.js` gerencia via JS
- **Não use HTML intermediário em templates** — markdown → TipTap JSON direto
- **Não modifique `wikilinkPlugin` para resolver nomes de arquivo** — adicione guard `ATTACHMENT_EXTS` para ignorar `.png`, `.pdf`, etc.

## Status das features

| Feature | Status | Notas |
|---|---|---|
| Aba Mês | ✅ Funcionando | NÃO MEXA |
| Editor CodeMirror 6 | ✅ Funcionando | Live preview, temas dinâmicos |
| Graph View (d3-force) | ✅ Funcionando | Hemisférios + cores automáticas por caderno |
| Wikilinks [[nota]] | ✅ Funcionando | Click em `.cm-wikilink`, autocomplete |
| Backlinks | ✅ Funcionando | Painel no rodapé do editor |
| QuickSwitcher (Cmd+O) | ✅ Funcionando | Notas humanas + máquina, badge visual |
| Busca na sidebar | ✅ Funcionando | Lupa + prefixes path:/file:/tag: |
| Importação Obsidian | ✅ Funcionando | Preserva subpastas e IDs |
| Templates | ✅ Funcionando | Gerenciador no ConfigTab |
| Sistema de temas | ✅ Funcionando | CSS vars + parser Obsidian/Catppuccin |
| Dark/Light toggle | ✅ Funcionando | Via CSS vars (useTheme.js) |
| Drag & drop notas | ✅ Funcionando | Mover entre cadernos |
| Autosave | ✅ Funcionando | Debounce 700ms + flush no unmount |
| Nomes únicos | ✅ Funcionando | "Sem título 2", "Sem título 3" |
| Anexos (imagem/PDF) | ✅ Funcionando | Paste Ctrl+V → salva em attachments/ → renderiza inline |
| Hemisfério Máquina | ✅ Funcionando | _machine/ isolada, merge seletivo onde necessário |
| Sync Supabase | ❌ Fase 3 | |

## Branches
- `main` — branch ativa de desenvolvimento
- `backup-tiptap` — snapshot antes da migração TipTap → CodeMirror
