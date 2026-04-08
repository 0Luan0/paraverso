# Luan — Claude Code Context

## What is it
Desktop app built with Electron + React called **Paraverso** — a digital notebook inspired by Obsidian.
Desktop-first. Stack: Electron 36, React 19 + Vite 8, Tailwind CSS 3, **CodeMirror 6** (editor), d3-force (graph), Dexie.js (IndexedDB), Supabase (future).

## Getting started
```bash
npm run dev            # Vite (frontend) — port 5173
npm run electron:dev   # Vite + Electron together
```

## Project structure
```
electron/
  main.cjs       — Electron main process + IPC handlers
  preload.cjs    — contextBridge (window.electron)

src/
  App.jsx                          — main layout (Month, Notes, Graph, Config)
  main.jsx                         — React entry point
  index.css                        — global styles + CSS variables
  db/index.js                      — data layer passthrough to vaultFs (known tech debt)
  lib/
    vaultFs.js                     — vault file operations (read/write/move notes)
    markdownUtils.js               — markdown utilities
    templateUtils.js               — template variable resolution ({{date}}, {{Title}})
    mesUtils.js                    — date/month utilities
    attachments.js                 — attachment names and paths
    graphColors.js                 — notebook color hashing → palette
    graphHemisphere.js             — merge graph nodes + hemisphere layout
  hooks/
    useTheme.js                    — dark-only mode (no toggle)
    useTexture.js                  — background textures (dots/grid)
    useSidebarResize.js            — sidebar drag resize
  contexts/VaultContext.jsx        — selected vault path
  services/
    machineContext.js              — _machine/ hemisphere service (IPC bridge)
  components/
    notas/                         — NotasTab, NoteEditorCM, NotesSidebar, OutlinePanel,
                                     NoteActionsMenu, TemplateModal
    mes/                           — month tab (DO NOT MODIFY): MesTab, RegistroDiario,
                                     DiaModal, ResumoMes, MetasMes, StatBar, HabitoSetupModal
    placeholders/GraphTab.jsx      — graph view SVG + d3-force with hemispheres
    layout/                        — TopBar, NavTabs, ActivityBar
    config/ConfigTab.jsx           — settings + Obsidian import + themes
    browser/BrowserPane.jsx        — embedded browser panel
    terminal/TerminalPane.jsx      — embedded terminal panel
    ui/                            — ContextMenu, MachineToast, Modals, Toast
    QuickSwitcher.jsx              — Cmd+O global search
    VaultSetup.jsx                 — initial vault selection
```

## Critical rules

1. **Month Tab** — IO layer uses file-based architecture: daily notes in `meses/{YYYY-MM}/`, categories as shared folders in `meses/`, month config in `meses/{YYYY-MM}/{Month}.md`
2. **`_machine` is a normal folder for CRUD** — notes inside it save, delete, and move like any other. `MACHINE_DIRS` in `shared.js` controls visual-only separation (sidebar, graph). Do NOT add `_machine` back to `RESERVED_DIRS`.
3. **DO NOT use `file://` for attachments** — use protocol `attachment://`
4. **DO NOT replace vault index** with `getTodasNotas()`
5. **DO NOT use `invalidateIndex()` with `new Map()`**
6. **DO NOT duplicate existing functions** — if a function already exists for a behavior (e.g., deleting a note, saving, moving), reuse it instead of creating a new one. Search the codebase first. This applies to UI handlers too: if a button needs the same behavior as another, call the same function.

## Vault hemispheres

The vault has two hemispheres with distinct access rules:

| Hemisphere | Folder | AI access | Visual style |
|---|---|---|---|
| Human | everything except `_machine/` | no | default colors |
| Machine | `_machine/` | full | purple (#9d8ff5) |

Both hemispheres use the same note pipeline (save, delete, move, index). The only difference is visual: purple in sidebar/graph and a separate collapsible section. `_machine` is excluded from `getNotebooks()` so it doesn't appear as a regular caderno.

## Critical modules (most depended upon)
1. **`db/index.js`** — used by 7 files: VaultContext, NotasTab, GraphTab, ConfigTab, QuickSwitcher, MesTab, MetasMes
2. **`VaultContext.jsx`** — used by almost all feature components
3. **`vaultFs.js`** — foundation of all file operations

## Known tech debt
- `db/index.js` is a pure passthrough to `vaultFs.js` — 7 files depend on it. Consolidation planned.

## Feature status

| Feature | Status |
|---|---|
| Month Tab | ✅ File-based architecture (daily notes + category folders) |
| CodeMirror 6 Editor | ✅ Live preview + dynamic themes |
| Graph View (d3-force) | ✅ Hemispheres + auto notebook colors |
| Wikilinks [[note]] | ✅ Click + autocomplete |
| QuickSwitcher (Cmd+O) | ✅ Human + machine notes |
| Theme system | ✅ Dark-only, CSS vars |
| Attachments (image/PDF) | ✅ Paste + inline render |
| Machine Hemisphere | ✅ _machine/ isolated |
| Supabase Sync | ❌ Phase 3 |

## Conditional rules (`.claude/rules/`)
Detailed context loads automatically when working on relevant files:
- `editor.md` — CodeMirror, plugins, attachments, save flow
- `machine-hemisphere.md` — RESERVED_DIRS, merge pattern
- `mes-tab.md` — month tab protection
- `graph-view.md` — SVG, d3-force, visual hemispheres
- `temas.md` — CSS vars, theme application
- `ipc-electron.md` — IPC channels, protocol handler, file formats
- `claude-md-guidelines.md` — rules for keeping CLAUDE.md team-oriented
- `no-personal-data.md` — no hardcoded paths, usernames, or personal data in code/generated files
- `clean-code.md` — reuse functions, no duplication, keep code minimal and focused

## Branches
- `main` — active development branch
- `backup-tiptap` — snapshot before TipTap → CodeMirror migration
