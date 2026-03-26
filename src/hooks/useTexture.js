import { useState, useEffect } from 'react'

const TEXTURAS = ['none', 'dots', 'grid']

export function useTexture() {
  const [textura, setTextura] = useState(() => {
    return localStorage.getItem('paraverso-textura') || 'none'
  })

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('texture-dots', 'texture-grid')
    if (textura === 'dots') html.classList.add('texture-dots')
    if (textura === 'grid') html.classList.add('texture-grid')
    localStorage.setItem('paraverso-textura', textura)
  }, [textura])

  function cycleTextura() {
    setTextura(t => {
      const idx = TEXTURAS.indexOf(t)
      return TEXTURAS[(idx + 1) % TEXTURAS.length]
    })
  }

  return { textura, cycleTextura }
}
