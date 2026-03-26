import { useState } from 'react'

const TEXTURAS = ['none', 'dots', 'grid']

export function useTexture() {
  const [textura, setTextura] = useState(() => {
    return localStorage.getItem('paraverso-textura') || 'none'
  })

  function cycleTextura() {
    setTextura(t => {
      const idx = TEXTURAS.indexOf(t)
      const next = TEXTURAS[(idx + 1) % TEXTURAS.length]
      localStorage.setItem('paraverso-textura', next)
      return next
    })
  }

  return { textura, cycleTextura }
}
