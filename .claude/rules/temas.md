---
paths:
  - "src/hooks/useTheme.js"
  - "src/index.css"
  - "src/components/config/ConfigTab.jsx"
---

# Theme System

## Current state
- **Dark-only app** — `useTheme.js` is 14 lines, adds `dark` class, no toggle
- Colors defined in `index.css` via `body.dark` and Tailwind

## CSS structure (index.css)
- Base reset in `@layer base`
- `body` has light defaults, `body.dark` overrides (dark-only in practice)
- Texture classes: `.editor-texture-dots`, `.editor-texture-grid`

## DO NOT
- Don't add `.dark` CSS vars via JS — they're in `index.css`
- Don't add theme toggle logic — app is dark-only by design
