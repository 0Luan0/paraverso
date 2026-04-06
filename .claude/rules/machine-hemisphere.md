---
paths:
  - "src/lib/vaultFs.js"
  - "src/components/placeholders/GraphTab.jsx"
  - "src/components/QuickSwitcher.jsx"
  - "src/contexts/VaultContext.jsx"
---

# Regras do Hemisferio Maquina (_machine/)

## Dois hemisferios do vault

| Hemisferio | Pasta | Acesso IA | Visivel na sidebar |
|---|---|---|---|
| Humano | tudo exceto `_machine/` | nao | sim |
| Maquina | `_machine/` | total | nao |

## Regra critica — RESERVED_DIRS
`_machine/` esta em `RESERVED_DIRS` em `vaultFs.js`.
`_getAllMdPaths()` NUNCA retorna arquivos de `_machine/`.

**Isso e intencional** — remove `_machine` de: sidebar, graph view, backlinks, busca.

## Padrao de merge (quando precisar incluir _machine)

```javascript
// Padrao correto — NAO modifique RESERVED_DIRS
const humanas = await getTodasNotasMetadata()           // sem _machine
const maquina = await window.electron.machineContext.listFiles(vaultPath)  // so _machine
const todas = [...humanas.map(n => ({...n, hemisphere: 'human'})),
               ...maquina.map(e => ({...e, hemisphere: 'machine'}))]
```

Ja implementado em: `QuickSwitcher.jsx`, `GraphTab.jsx`

## O que NAO fazer
- NUNCA remova `_machine` de `RESERVED_DIRS`
- Nao use `getTodasNotas()` para substituir vault index
