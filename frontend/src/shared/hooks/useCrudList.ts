import { useState, useEffect, useRef, useCallback } from 'react'
import type { ListParams, PaginatedResponse } from '../../core/types'
import { ApiError } from '../../core/services/backendClient'
import { useGlobalToast } from '../../shared/components/feedback/Toast'

interface UseCrudListOptions<T> {
  fetchFn: (params: ListParams) => Promise<PaginatedResponse<T>>
  pageSize?: number
  enableCache?: boolean
  additionalFilters?: Record<string, string | boolean | undefined>
}

interface UseCrudListResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  page: number
  total: number
  search: string
  setPage: (page: number) => void
  setSearch: (search: string) => void
  refresh: () => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
}

// Module-level cache per (fetchFn identity + filters + page) for instant paint
// on revisit, and an in-flight dedupe map so React StrictMode's double mount
// (dev) issues exactly ONE network call instead of two.
const _cache = new Map<string, { data: unknown[]; total: number }>()
const _inflight = new Map<string, Promise<{ data: unknown[]; total: number }>>()

export function useCrudList<T extends { id: string }>(
  options: UseCrudListOptions<T>,
): UseCrudListResult<T> {
  const { fetchFn, pageSize = 10, enableCache = true, additionalFilters } = options

  // Keep the latest fetchFn/additionalFilters/search without making them effect
  // deps. They are recreated every render at the call site; depending on their
  // identity would retrigger the load effect on every render (infinite loop).
  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn
  const additionalFiltersRef = useRef(additionalFilters)
  additionalFiltersRef.current = additionalFilters
  const searchRef = useRef('')

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const isSearchMounted = useRef(false)

  // Stable string identity for the logical query INCLUDING the page. Changes
  // only when the query or page changes, so it is safe to read at any time.
  const buildKey = () =>
    fetchFnRef.current.toString() +
    JSON.stringify(additionalFiltersRef.current ?? {}) +
    '|p' + page

  const cached = enableCache ? _cache.get(buildKey()) : undefined

  const [data, setData] = useState<T[]>(cached?.data as T[] ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(cached?.total ?? 0)

  searchRef.current = search
  const { addToast } = useGlobalToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const key = buildKey()
    try {
      let res: { data: T[]; total: number }
      if (_inflight.has(key)) {
        // StrictMode (dev) double-invokes mount effects; reuse the pending
        // request so we make exactly ONE network call, not two.
        const r = await _inflight.get(key)!
        res = { data: r.data as T[], total: r.total }
      } else {
        const p = fetchFnRef.current({
          page,
          limit: pageSize,
          search: searchRef.current,
          ...additionalFiltersRef.current,
        })
        const stored = p.then(
          (r) => {
            _inflight.delete(key)
            return { data: r.data, total: r.total }
          },
          (e) => {
            _inflight.delete(key)
            throw e
          },
        )
        _inflight.set(key, stored)
        res = await stored
        if (enableCache) _cache.set(key, { data: res.data, total: res.total })
      }
      setData(res.data)
      setTotal(res.total)
    } catch (err) {
      // A 401 is handled globally (redirect to login); don't toast it here.
      if (err instanceof ApiError && err.status === 401) {
        setError('Sesi berakhir. Silakan masuk kembali.')
      } else if (err instanceof Error && 'status' in err) {
        // Network/connection failure surfaced by backendClient as a generic Error.
        setError('Backend tidak tersedia. Periksa koneksi lalu coba lagi.')
        addToast({ type: 'error', message: 'Backend tidak tersedia. Coba lagi.' })
      } else {
        setError('Gagal memuat data. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
    // `search` is intentionally NOT a dep here: typing must NOT fire an
    // immediate fetch — only the debounced refreshKey below does (1 fetch/300ms).
  }, [page, pageSize, refreshKey, addToast])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search: skip initial mount, reset page to 1 on new search.
  useEffect(() => {
    if (!isSearchMounted.current) {
      isSearchMounted.current = true
      return
    }
    setPage(1)
    const timeout = setTimeout(() => {
      setRefreshKey((k) => k + 1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return { data, loading, error, page, total, search, setPage, setSearch, refresh, deleteId, setDeleteId }
}
