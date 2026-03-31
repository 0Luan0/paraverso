# Paraverso — Contexto para Claude Code

## O que é
App desktop Electron + React chamado **Paraverso** — caderno digital estilo Obsidian/Notion.
Desktop-first. Stack: Electron 36, React + Vite, Tailwind CSS, TipTap v3, Dexie.js (IndexedDB), Supabase (futuro).

## Como rodar
```bash
npm run dev          # Vite (frontend)
npm run electron     # Electron (em outra aba)
# ou: npm run start  # ambos juntos se configurado
```

## Estrutura principal
```
electron/
  main.cjs       — processo principal Electron + IPC handlers
  preload.cjs    — contextBridge (window.electron)

src/
  App.jsx                          — roteamento entre as 4 abas
  db/index.js                      — camada de dados unificada (Dexie ou vault)
  lib/
    vaultFs.js                     — operações de arquivo no vault (leitura/escrita de notas)
    markdownUtils.js               — Markdown ↔ TipTap JSON
  contexts/VaultContext.jsx        — path do vault selecionado
  components/
    notas/
      NotasTab.jsx                 — ✅ REESCRITO — orquestrador principal das notas
      NoteEditor.jsx               — ✅ REESCRITO — editor TipTap com backlinks
      WikiLinkExtension.js         — extensão TipTap para [[wikilinks]]
      HashtagExtension.js          — extensão TipTap para #hashtags
      NotesSidebar.jsx             — sidebar (cadernos + lista de notas)
      FindBar.jsx                  — Cmd+F search no editor
      TemplateModal.jsx            — templates de nota (Cmd+T)
    mes/
      MesTab.jsx                   — ✅ FUNCIONANDO — aba mês (não mexa!)
    placeholders/
      BuscaTab.jsx                 — ✅ FUNCIONANDO — busca full-text (não mexa!)
      GraphTab.jsx                 — graph view (não implementado ainda)
    QuickSwitcher.jsx              — Cmd+O para abrir notas rapidamente
    config/
      ConfigTab.jsx                — configurações: vault, caderno padrão, journal, templates, importação
```

## Arquitetura de notas (importante)

### Vault Index (em memória)
`NotasTab.jsx` mantém um `Map` construído via `getTodasNotasMetadata()` (lê só frontmatter, sem parsing de conteúdo). Wikilink click = lookup O(1), não scan de arquivos.

```js
// buildVaultIndex() → Map<titulo_normalizado_NFC_lowercase, metadata>
// Indexa por titulo E por _filename para cobrir acentos e variações
vaultIndexRef.current.get('nome da nota')  // → { id, titulo, caderno, _filename }
```

### Fluxo de wikilink click
1. Extrai título (strip alias após `|`)
2. Lookup O(1) no vault index
3. Se não encontrado → rebuild index e tenta de novo
4. Carrega apenas o caderno da nota encontrada
5. Se não existe → cria nova nota

### Formatos de arquivo suportados
- **Paraverso nativo** (tem `id:` no frontmatter YAML) — formato primário
- **Plain markdown** (sem frontmatter) — importado do Obsidian, tratado como leitura
- **Obsidian YAML** (frontmatter sem `id:`) — convertido ao salvar

### NFD/NFC (macOS critical)
`dialog.showOpenDialog` retorna paths NFC, `fs.promises.readdir` pode retornar NFD.
Toda comparação de path usa `.normalize('NFC')`. Ver `_topDir()` em vaultFs.js.

## IPC (main.cjs ↔ renderer via window.electron)
Handlers registrados no main.cjs e expostos via preload.cjs:
- `fs:readFile`, `fs:writeFile`, `fs:deleteFile`, `fs:exists`
- `fs:readdir` (com opção `{ dirsOnly: true }`)
- `fs:readdirRecursive` — lista todos `.md` recursivamente (requer restart do Electron após adicionar)
- `fs:mkdir`, `fs:joinPath`
- `dialog:openFolder`

## Paleta de cores (Tailwind custom)
```
bg / bg-dark          — fundo principal (#F2EDE4 / #1A1812)
surface / surface-dark — superfície cards (#FAF6EF / #221E16)
ink / ink-dark        — texto (#1A1A18 / #EDE8DF)
accent / accent-dark  — laranja (#C17A3A / #D4924A)
bdr / bdr-dark        — bordas sutis
```

## Status das features

| Feature | Status | Notas |
|---|---|---|
| Aba Mês | ✅ Funcionando | NÃO MEXA |
| Aba Busca | ✅ Funcionando | NÃO MEXA sem necessidade |
| Editor de notas | ✅ Reescrito | TipTap v3, vault index |
| Wikilinks [[nota]] | ✅ Corrigido | Vault index O(1), click via capture-phase DOM listener |
| Wikilink autocomplete | ✅ Corrigido | Dropdown flip (abre acima quando sem espaço), só mostra com cursor no final |
| Backlinks | ✅ Implementado | Lazy, painel no rodapé do editor |
| QuickSwitcher (Cmd+O) | ✅ Funcionando | |
| Importação Obsidian | ✅ Corrigido | Preserva ID, modo sobrescrever, subpastas |
| Journal (nota diária) | ✅ Implementado | Botão calendário na tab bar + tela vazia, config de pasta em ConfigTab |
| Templates folder | ✅ Corrigido | Pasta de templates agora aparece na sidebar |
| Autosave | ✅ Corrigido | Usa notaAtivaRef (sync) para flush confiável no beforeunload |
| Graph view | ❌ Adiado | |
| Sync Supabase | ❌ Fase 3 | |

## O que NÃO fazer
- **Não mexa na Aba Mês** (`MesTab.jsx` e arquivos em `mes/`) — funcionando perfeitamente
- **Não mexa na Aba Busca** (`BuscaTab.jsx`) sem necessidade real
- **Não substitua o vault index** por `getTodasNotas()` — era a causa raiz de todos os bugs de wikilink
- **Não use `invalidateIndex()` com `new Map()`** — limpar o mapa mata o autocomplete. Usar `buildVaultIndex()` (rebuild em background sem limpar dados atuais)
- **Não use CustomEvent para comunicação WikiLink→React** — usar callback direto via extension options (CustomEvent chain falhava silenciosamente)

## Bugs corrigidos (importação Obsidian)
1. `lerNotaVault` — `cadernoHint` agora tem prioridade sobre `frontmatter.caderno` (evita salvar na pasta errada)
2. `getTodasNotasMetadataVault` — usa pasta real no disco, não `frontmatter.caderno`
3. `importarArquivo` — preserva `id:` existente no frontmatter (evita duplicatas de ID)
4. `deletarNotaVault` — agora usa `_getAllMdPaths` para encontrar notas em subpastas
5. ConfigTab — botão "Sobrescrever notas existentes" para re-importação limpa
6. ConfigTab — seção "Limpar todas as notas" para reset antes de re-importar

## Bugs corrigidos (sessão 30/mar/2026)
7. **Autocomplete desaparecia após ~700ms** — `invalidateIndex()` limpava o Map → autosave disparava → `getSuggestions()` retornava `[]`. Fix: `invalidateIndex()` agora chama `buildVaultIndex()` sem limpar
8. **Conteúdo perdido ao reiniciar** — `beforeunload` capturava `notaAtiva` (React state async) via closure stale. Fix: `notaAtivaRef` (useRef sync) atualizado antes do setState
9. **Dropdown não fechava ao selecionar** — `command()` setava `sugg.active=false` mas não chamava `ext.onSuggestionExit()`. Fix: adicionado `ext.onSuggestionExit()` em `command()`
10. **Click em [[link]] inseria cursor** — `handleMouseDown` do ProseMirror recebe `(view, event)` (2 args, não 3). Abordagem final: capture-phase DOM listener (`addEventListener('mousedown', handler, true)`) + callback direto `onWikiLinkClick` via extension options
11. **Autocomplete abria no meio de [[link]]** — `getSuggMatch()` não verificava posição do cursor. Fix: checa `textAfter` — se há texto entre cursor e `]]`, retorna null
12. **Dropdown autocomplete saía da tela** — posição fixa `coords.bottom + 6`. Fix: `WikiLinkDropdown` detecta espaço disponível e faz flip para cima se necessário
13. **Pasta de templates não aparecia na sidebar** — `getCadernosVault` filtrava `configuredTemplatesDir`. Fix: removido filtro

## Arquitetura do WikiLinkExtension (importante)

O `WikiLinkExtension.js` é uma extensão TipTap complexa. Pontos-chave para quem for mexer:

- **Decorations**: wikilinks são texto puro `[[...]]` estilizado via `Decoration.inline` quando cursor está fora. Cursor dentro → texto editável sem decoração.
- **Autocomplete**: `getSuggMatch()` detecta `[[query` no texto. Só sugere se cursor está no final do conteúdo (antes de `]]` ou sem `]]` ainda). Objeto `sugg` é compartilhado no escopo de `addProseMirrorPlugins()`.
- **Click handler**: usa `addEventListener('mousedown', handler, true)` (capture phase no DOM) — ProseMirror `handleMouseDown` e `handleClick` não funcionavam. O handler chama `onWikiLinkClick` (callback direto via extension options).
- **Dropdown flip**: `WikiLinkDropdown` em NoteEditor.jsx mede viewport e faz flip para cima quando sem espaço abaixo.

## Journal (nota diária)

- **Botão**: ícone de calendário na tab bar (ao lado do "+") e na tela vazia
- **Função**: `criarNotaDiaria()` em NotasTab.jsx
- **Nome**: `"30 março 2026"` (dia + mês por extenso + ano)
- **Header H1**: `"Segunda, 30 de março de 2026"`
- **Pasta destino**: configurável em ConfigTab → "Pasta para notas diárias" (`window.electron.getConfig('journalCaderno')`)
- **Dedup**: verifica vault index antes de criar — se já existe, navega para ela

## Próximos passos sugeridos
1. Graph view (React Flow) — nós coloridos por caderno, tamanho proporcional a conexões
2. Templates de página (já tem UI, falta popular com templates padrão)
3. Sidebar com subpastas expansíveis (vault do usuário tem subpastas dentro dos cadernos)
4. Tags (#tag) com visual distinto no editor (cor accent)
5. PWA / modo offline completo
6. Sync Supabase (Fase 3)
