/**
 * graphColors.js — Deterministic caderno → color mapping.
 * Same caderno always returns same color. _machine → fixed purple.
 */

const PALETA = [
  '#4a9eff', // azul
  '#e4694a', // laranja-vermelho
  '#f5c842', // amarelo
  '#4ecb71', // verde
  '#c084fc', // lilás
  '#38bdf8', // ciano
  '#fb7185', // rosa
  '#a3e635', // verde-limão
]

function hashCaderno(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) & 0xffffffff
  }
  return Math.abs(h)
}

export function corPorCaderno(caderno) {
  if (!caderno || caderno === '_machine') return '#9d8ff5'
  return PALETA[hashCaderno(caderno) % PALETA.length]
}
