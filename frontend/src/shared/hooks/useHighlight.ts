import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

interface UseHighlightResult {
  highlightId: string | null
  getHighlightClass: (id: string) => string
}

export function useHighlight(duration = 1500): UseHighlightResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [activeId, setActiveId] = useState<string | null>(highlightId)

  useEffect(() => {
    if (highlightId) {
      setActiveId(highlightId)

      const timer = setTimeout(() => {
        setActiveId(null)
        // Remove the highlight param from URL after animation completes
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete('highlight')
            return next
          },
          { replace: true }
        )
      }, duration)

      return () => clearTimeout(timer)
    } else {
      setActiveId(null)
    }
  }, [highlightId, duration, setSearchParams])

  const getHighlightClass = (id: string): string => {
    return activeId === id ? 'animate-highlight-once' : ''
  }

  return { highlightId, getHighlightClass }
}
