import { useState, useEffect, useRef, useCallback } from 'react'
import { userService } from '../../core/services/users'
import { programService } from '../../core/services/programs'
import { ROUTES } from '../../core/constants/app'
import { sessionService } from '../../core/services/sessions'
import { frameService } from '../../core/services/frames'

// ── Types ──
export interface SearchResultItem {
  id: string
  label: string
  subtitle: string
  route: string
}

export interface SearchResultGroup {
  category: string
  route: string
  items: SearchResultItem[]
}

interface UseGlobalSearchResult {
  query: string
  setQuery: (q: string) => void
  loading: boolean
  results: SearchResultGroup[]
  searched: boolean
  reset: () => void
}

export function useGlobalSearch(): UseGlobalSearchResult {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResultGroup[]>([])
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const [usersRes, programsRes, sessionsRes, framesRes] = await Promise.all([
        userService.getAll({ search: q, page: 1, limit: 5 }),
        programService.getAll({ search: q, page: 1, limit: 5 }),
        sessionService.getAll({ search: q, page: 1, limit: 5 }),
        frameService.getAll({ search: q, page: 1, limit: 5 }),
      ])
      const groups: SearchResultGroup[] = []
      if (usersRes.data.length > 0) {
        groups.push({
          category: 'Users',
          route: ROUTES.ADMIN.USERS,
          items: usersRes.data.map((u) => ({ id: u.id, label: u.name, subtitle: `${u.email} · ${u.role}`, route: `${ROUTES.ADMIN.USERS}?highlight=${u.id}` })),
        })
      }
      if (programsRes.data.length > 0) {
        groups.push({
          category: 'Programs',
          route: ROUTES.ADMIN.PROGRAMS,
          items: programsRes.data.map((p) => ({ id: p.id, label: p.name, subtitle: p.description ?? '', route: `${ROUTES.ADMIN.PROGRAMS}?highlight=${p.id}` })),
        })
      }
      if (sessionsRes.data.length > 0) {
        groups.push({
          category: 'Sessions',
          route: ROUTES.ADMIN.SESSIONS,
          items: sessionsRes.data.map((s: { id: string; name: string; location: string; status: string }) => ({ id: s.id, label: s.name, subtitle: `${s.location} · ${s.status}`, route: `${ROUTES.ADMIN.SESSIONS}?highlight=${s.id}` })),
        })
      }
      if (framesRes.data.length > 0) {
        groups.push({
          category: 'Frames',
          route: ROUTES.ADMIN.FRAMES,
          items: framesRes.data.map((f) => ({ id: f.id, label: f.name, subtitle: f.is_active ? 'Aktif' : 'Nonaktif', route: `${ROUTES.ADMIN.FRAMES}?highlight=${f.id}` })),
        })
      }
      setResults(groups)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Debounce ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => performSearch(query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, performSearch])

  const reset = useCallback(() => {
    setQuery('')
    setResults([])
    setSearched(false)
  }, [])

  return { query, setQuery, loading, results, searched, reset }
}
