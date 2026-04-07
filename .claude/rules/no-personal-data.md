---
paths:
  - "src/**"
  - "electron/**"
---

# No Personal Data in Code or Generated Files

This app is a product — any user will run it. Code and auto-generated vault files must never contain developer-specific data.

## Rules

### In source code (`src/`, `electron/`)
- Never hardcode absolute paths (`/Users/...`, `C:\...`)
- Never hardcode vault folder names specific to one developer
- Never hardcode usernames, emails, or personal identifiers
- All file paths must be built dynamically from `vaultPath` (provided at runtime by VaultContext)

### In generated vault files (notes, configs, templates)
- Files created by the app (daily notes, `_config.md`, resumo notes, meta notes) must only contain **relative paths** or **no paths at all**
- Frontmatter must not include absolute file system paths
- Default values (habit names, category names, template content) must be generic — not personal to any developer

### In templates and defaults
- Default habits, categories, and templates must make sense for any new user
- Never reference specific vault locations in template variables
- `{{date}}`, `{{time}}`, `{{Title}}` are safe — they resolve at runtime

### Testing
- When writing tests, use synthetic data (e.g., `criarMesVazio(2026, 4)`) — never reference a real vault path
- Mock `el()` and `vaultPath` in tests, never use actual filesystem locations

## How to check
Before committing, verify:
1. `grep -r "/Users/" src/` returns no matches (except test mocks)
2. No generated `.md` files contain absolute paths
3. Default values work for a fresh vault with no prior data
