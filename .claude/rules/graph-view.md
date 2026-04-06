---
paths:
  - "src/components/placeholders/GraphTab.jsx"
  - "src/lib/graphColors.js"
  - "src/lib/graphHemisphere.js"
---

# Graph View (SVG + d3-force)

- SVG puro (sem React Flow)
- d3-zoom para pan/zoom, d3-drag para arrastar nos
- **Cores por caderno**: `corPorCaderno()` em `graphColors.js` — hash deterministico → 8 cores estilo Obsidian
- **Hemisferios visuais**: divisor central fixo, labels "hemisferio humano" / "hemisferio maquina"
- **Nos de _machine**: roxo fixo `#a855f7`, carregados via `machineContext.listFiles()` e merged
- **Forca hemisferica**: `forceX` com target `±(width * 0.22)`, strength `0.12`
- Arestas cruzam o divisor quando nota humana linka nota maquina

## Arquitetura do SVG
```
<svg>
  <g class="brain-decoration-fixed">   ← FORA do zoom (fixo na tela)
    divisor central, labels
  </g>
  <g ref={zoomGroupRef}>               ← DENTRO do zoom (pan/zoom)
    links, nos, labels
  </g>
</svg>
```
