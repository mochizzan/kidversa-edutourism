import { useState, useEffect, useRef, useCallback } from 'react'
import type { ListParams, PaginatedResponse } from '../../core/types'
import { ApiError } from '../../core/services/backendClient'
import { useGlobalToast } from '../../shared/components/feedback/Toast'
import { useTenantScope } from '../../core/hooks/useTenantScope'

interface UseCrudListOptions<T> {
  fetchFn: (params: ListParams) => Promise<PaginatedResponse<T>>
  pageSize?: number
  enableCache?: boolean
  additionalFilters?: Record<string, string | boolean | undefined>
  // When true, the list is tenant-scoped: switching the active tenant (sidebar
  // switcher) refetches the list. Used by admin data pages. When false, tenant
  // changes are ignored (e.g. the global /admin/tenants page, and UsersPage
  // which manages its own per-tenant filter via the URL, independent of sidebar).
  scopeToTenant?: boolean
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

// Module-level cache per (fetchFn identity + filters + page + tenant) for
// instant paint on revisit, and an in-flight dedupe map so React StrictMode's
// double mount (dev) issues exactly ONE network call instead of two.
const _cache = new Map<string, { data: unknown[]; total: number }>()
const _inflight = new Map<string, Promise<{ data: unknown[]; total: number }>>()

export function useCrudList<T extends { id: string }>(
  options: UseCrudListOptions<T>,
): UseCrudListResult<T> {
  const { fetchFn, pageSize = 10, enableCache = true, additionalFilters, scopeToTenant = false } = options

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

  // React to active-tenant changes when the list is tenant-scoped. `tenantId`
  // is '' when not scoped, so it never triggers a refetch on tenant switch.
  const { tenantId } = useTenantScope()
  const tenantDep = scopeToTenant ? tenantId ?? '' : ''

  // Stable string identity for the logical query INCLUDING the page and tenant.
  // Changes only when the query, page, or active tenant changes, so it is safe
  // to read at any time.
  const buildKey = () =>
    fetchFnRef.current.toString() +
    JSON.stringify(additionalFiltersRef.current ?? {}) +
    '|p' + page +
    '|t' + tenantDep

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
    // `tenantDep` IS a dep: when the active tenant changes (scoped lists), the
    // cache key changes and we refetch with the new tenant header.
  }, [page, pageSize, refreshKey, addToast, tenantDep])

  useEffect(() => {
    void load()
  }, [load])

  // Debounced search. Guard against React StrictMode's double-invoked mount
  // effect: compare to the previous value instead of a "first run" flag, so the
  // debounce only fires on a REAL change (user typing) — never on mount. This
  // prevents a spurious second fetch shortly after opening the page.
  const prevSearchRef = useRef(search)
  useEffect(() => {
    if (prevSearchRef.current === search) return
    prevSearchRef.current = search
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
