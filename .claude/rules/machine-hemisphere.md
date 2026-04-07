---
paths:
  - "src/lib/vault/shared.js"
  - "src/lib/vault/folderOps.js"
  - "src/components/placeholders/GraphTab.jsx"
  - "src/components/QuickSwitcher.jsx"
  - "src/components/notas/NotesSidebar.jsx"
---

# Machine Hemisphere (_machine/)

## Two hemispheres — visual separation only

| Hemisphere | Folder | AI access | Visual style |
|---|---|---|---|
| Human | everything except `_machine/` | no | default colors |
| Machine | `_machine/` | full | purple (#9d8ff5) |

## Architecture

`_machine` is a **normal folder** for all CRUD operations. Notes inside it save, delete, move, and index like any other note. The separation is purely visual:

- **`MACHINE_DIRS`** in `shared.js` — used for visual filtering (sidebar section, graph color, QuickSwitcher badge)
- **`RESERVED_DIRS`** in `shared.js` — empty. `_machine` is NOT reserved.
- **`getNotebooks()`** excludes `MACHINE_DIRS` so `_machine` doesn't appear in the human cadernos list
- **`_getAllMdPaths()`** includes `_machine` files (they're indexed, searchable, deletable)

## Hemisphere tagging

Notes get tagged with `hemisphere: 'machine'` or `'human'` based on `caderno === '_machine'`. This tagging happens in:
- `NotasTab.buildVaultIndex()` — for wikilink resolution
- `QuickSwitcher` — for purple styling
- `GraphTab` — for hemisphere layout and purple node color

## Structural protection

The `_machine` folder itself cannot be moved, renamed, or deleted (guarded by `MACHINE_DIRS` checks in `folderOps.js`). But notes and subfolders inside it are fully editable.

## What NOT to do
- Do NOT add `_machine` back to `RESERVED_DIRS`
- Do NOT use `machineContext.listFiles()` for note loading — use the normal pipeline (`getNotasPorCaderno('_machine')`)
- Do NOT create separate note objects for machine files — they go through `readNote()` like all others
