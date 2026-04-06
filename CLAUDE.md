# Paraverso — Claude Code Context

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

1. **DO NOT modify the Month Tab** (`src/components/mes/`)
2. **DO NOT remove `_machine` from `RESERVED_DIRS`** in vaultFs.js
3. **DO NOT use `file://` for attachments** — use protocol `attachment://`
4. **DO NOT replace vault index** with `getTodasNotas()`
5. **DO NOT use `invalidateIndex()` with `new Map()`**

## Vault hemispheres

The vault has two hemispheres with distinct access rules:

| Hemisphere | Folder | AI access | Visible in sidebar |
|---|---|---|---|
| Human | everything except `_machine/` | no | yes |
| Machine | `_machine/` | full | no |

To include `_machine` notes where needed, use the merge pattern (see rule `machine-hemisphere.md`).

## Critical modules (most depended upon)
1. **`db/index.js`** — used by 7 files: VaultContext, NotasTab, GraphTab, ConfigTab, QuickSwitcher, MesTab, MetasMes
2. **`VaultContext.jsx`** — used by almost all feature components
3. **`vaultFs.js`** — foundation of all file operations

## Known tech debt
- `db/index.js` is a pure passthrough to `vaultFs.js` — 7 files depend on it. Consolidation planned.
- `NotasTab.jsx` has 1,528 lines — candidate for decomposition.

## Feature status

| Feature | Status |
|---|---|
| Month Tab | ✅ DO NOT MODIFY |
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

## Branches
- `main` — active development branch
- `backup-tiptap` — snapshot before TipTap → CodeMirror migration
