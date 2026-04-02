// src/hooks/useSidebarResize.js
import { useState, useRef, useCallback, useEffect } from 'react'

const LS_WIDTH_KEY = 'paraverso-sidebar-width'
const LS_COLLAPSED_KEY = 'paraverso-sidebar-collapsed'
const MIN_WIDTH = 160
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 220

export function useSidebarResize() {
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(LS_WIDTH_KEY)
    const parsed = parseInt(saved, 10)
    return !isNaN(parsed) ? Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH
  })

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(LS_COLLAPSED_KEY) === 'true'
  })

  const isResizing = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Persiste largura
  useEffect(() => {
    localStorage.setItem(LS_WIDTH_KEY, String(width))
  }, [width])

  // Persiste collapsed
  useEffect(() => {
    localStorage.setItem(LS_COLLAPSED_KEY, String(collapsed))
  }, [collapsed])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [])

  const onResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizing.current = true
    startX.current = e.clientX
    startWidth.current = width

    const onMouseMove = (e) => {
      if (!isResizing.current) return
      const delta = e.clientX - startX.current
      const newWidth = Math.min(Math.max(startWidth.current + delta, MIN_WIDTH), MAX_WIDTH)
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [width])

  return { width, collapsed, toggleCollapsed, onResizeStart }
}
