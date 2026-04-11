---
paths:
  - "src/components/mes/**"
---

# Month Tab — Stable Components

The UI components in `src/components/mes/` are stable. Do not modify their
behavior, layout, or component structure. Design system updates (token
swaps, className migrations to shared utility classes like `.btn-primary`)
are allowed and expected when the global design system changes.

Stable files:
- `MesTab.jsx`
- `RegistroDiario.jsx`
- `DiaModal.jsx`
- `ResumoMes.jsx`
- `HabitoSetupModal.jsx`
- `MetasMes.jsx`
- `StatBar.jsx`

## What is allowed
- Replace broken token combinations with shared utility classes
  (e.g. swapping `bg-accent dark:bg-accent-dark text-white` for `.btn-primary`)
- Migrate from deprecated color tokens to new semantic tokens when the
  design system is consolidated
- Non-visual bug fixes (state, data flow, event handlers)

## What is NOT allowed without explicit approval
- Layout restructuring (rearranging sections, changing grid dimensions)
- Adding or removing features
- Changing the copy/wording
- Replacing the component architecture (e.g. split into sub-components)

## IO layer (editable)

Month data is stored in `meses/YYYY-MM.md` using human-readable markdown format.
The serialization layer lives in `src/lib/vault/monthMarkdown.js` (serializer + parser)
and `src/lib/vault/monthIO.js` (file CRUD). These files can be modified.

### File format

```markdown
---
id: 2026-04
ano: 2026
mes: 4
habitos:
  - Treino
  - Leitura
metas:
  - id: uuid
    categoria: Leituras
    itens:
      - id: uuid
        texto: Ler livro X
        feito: false
---

# Abril 2026

## Resumo
Month summary text...

## Dia 1 — Quarta
Daily memo text
- [x] Treino
- [ ] Leitura

> Expanded note (dia.nota) as blockquote
```

Habit states: `- [x]` = done (1), `- [ ]` = empty (0), `- [~]` = failed (2).
Legacy `---json` files auto-migrate to this format on first save.
