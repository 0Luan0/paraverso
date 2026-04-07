---
paths:
  - "src/components/mes/**"
---

# Month Tab — Protected Components

The UI components in `src/components/mes/` are stable and protected. Do not modify them.

Protected files:
- `MesTab.jsx`
- `RegistroDiario.jsx`
- `DiaModal.jsx`
- `ResumoMes.jsx`
- `HabitoSetupModal.jsx`
- `MetasMes.jsx`
- `StatBar.jsx`

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
