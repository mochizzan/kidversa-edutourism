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

// Module-level cache per fetchFn identity + filters
const _cache = new Map<string, { data: unknown[]; total: number }>()

export function useCrudList<T extends { id: string }>(
  options: UseCrudListOptions<T>,
): UseCrudListResult<T> {
  const { fetchFn, pageSize = 10, enableCache = true, additionalFilters } = options

  const cacheKey = fetchFn.toString() + JSON.stringify(additionalFilters)
  const cached = enableCache ? _cache.get(cacheKey) : undefined

  const [data, setData] = useState<T[]>(cached?.data as T[] ?? [])
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(cached?.total ?? 0)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const isSearchMounted = useRef(false)

  const { addToast } = useGlobalToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchFn({ page, limit: pageSize, search, ...additionalFilters })
      setData(res.data)
      setTotal(res.total)
      if (enableCache) {
        _cache.set(cacheKey, { data: res.data, total: res.total })
      }
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
  }, [page, pageSize, search, fetchFn, enableCache, cacheKey, additionalFilters, refreshKey, addToast])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search: skip initial mount, reset page to 1 on new search
  useEffect(() => {
    if (!isSearchMounted.current) {
      isSearchMounted.current = true
      return
    }
    setPage(1)
    const timeout = setTimeout(() => {
      setRefreshKey(k => k + 1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  return { data, loading, error, page, total, search, setPage, setSearch, refresh, deleteId, setDeleteId }
}
