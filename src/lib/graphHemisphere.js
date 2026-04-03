/**
 * graphHemisphere.js — Pure logic for hemisphere graph visualization.
 * No d3, no DOM — testable.
 */

const MACHINE_COLOR = '#9d8ff5'

/**
 * Merges human notes + machine files into a single array of graph nodes.
 * Same merge pattern as buildVaultIndex and QuickSwitcher.
 */
export function mergeGraphNodes(notasHumanas, arquivosMaquina) {
  const humanos = notasHumanas.map(n => ({
    ...n,
    hemisphere: 'human',
  }))

  const maquina = arquivosMaquina.map(fp => {
    const filename = fp.split(/[/\\]/).pop().replace(/\.md$/i, '').normalize('NFC')
    const parts = fp.split(/[/\\]/)
    const machineIdx = parts.findIndex(p => p === '_machine')
    const rel = machineIdx >= 0 ? parts.slice(machineIdx).join('/').replace(/\.md$/i, '') : filename
    const subpasta = machineIdx >= 0 && parts[machineIdx + 1] ? parts[machineIdx + 1] : null

    return {
      id: 'machine:' + rel,
      titulo: filename,
      caderno: '_machine',
      subpasta,
      tags: [],
      wikilinks: [],
      editadaEm: 0,
      _filename: filename,
      hemisphere: 'machine',
      relativePath: rel,
    }
  })

  return [...humanos, ...maquina]
}

/**
 * Returns the target X position for a node based on its hemisphere.
 * Human → left quarter, Machine → right quarter.
 * Used to replace forceX(0) with hemisphere-aware positioning.
 */
export function hemisphereTargetX(width) {
  const offset = width * 0.22
  return (node) => node.hemisphere === 'machine' ? offset : -offset
}

/**
 * Returns the color for a machine node.
 */
export function machineNodeColor() {
  return MACHINE_COLOR
}
