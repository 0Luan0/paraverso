---
paths:
  - "src/**"
  - "electron/**"
---

# Clean Code — Reuse, Don't Repeat

## Core principle
Before writing any new function, search the codebase for existing ones that do the same thing. Reuse always wins over duplication.

## Rules

### No duplicated logic
- If a function already exists for a behavior (saving, deleting, moving, creating notes, parsing), use it
- This applies to UI handlers too — if two buttons need the same behavior, call the same function
- Extract shared logic into a utility or module rather than copying it inline

### Search before writing
- Before creating a helper function, grep for similar ones in `src/lib/`, `src/db/`, and `src/lib/vault/`
- Common patterns already exist: `sanitizeName()`, `yamlStr()`, `mesId()`, `dailyNoteTitle()`, `splitCadernoPath()`
- Check `db/index.js` for data layer functions before adding new pass-throughs

### Keep functions small and focused
- One function = one responsibility
- If a function does two things, split it
- Name functions by what they do, not how — `ensureDailyNote()` not `checkAndCreateIfMissing()`

### Minimize code
- Prefer simple solutions over clever ones
- Remove dead code, unused imports, and commented-out blocks
- If a variable is used once, inline it unless the name adds clarity

### One pipeline, style at the edge
- If something behaves like a note, it goes through the note pipeline (save, delete, move, index). No parallel code paths.
- Visual differences (colors, layout sections, badges) belong in the **rendering layer**, not the data layer.
- Never exclude a folder from CRUD operations just because it looks different in the UI. Use the same functions, tag with a flag (e.g. `hemisphere`), and branch only at render time.
- Red flag: if you're writing a separate component that reimplements what an existing one does (e.g. a read-only `MachineFileItem` next to a full `NoteItem`), you're creating a parallel path. Stop and reuse the original with a style prop instead.

### Constants and shared values
- Shared constants go in the appropriate module (`mesUtils.js` for date/month, `shared.js` for vault constants)
- Never define the same constant in two files — import from the source of truth
- Example: `MESES_PT_LOWER` lives in `mesUtils.js`, not duplicated in NotasTab
