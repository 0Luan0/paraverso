import { useState, useEffect } from 'react'

export function useTheme() {
  const dark = true // dark-only app

  useEffect(() => {
    document.documentElement.classList.add('dark')
    document.body.classList.add('dark')
  }, [])

  const toggleTheme = () => {} // no-op — dark only

  return { dark, toggleTheme }
}
