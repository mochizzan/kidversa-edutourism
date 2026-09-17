import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../core/constants/api'
import { ApiError } from '../../core/services/backend-client'
import { useGlobalToast } from '../components/feedback/Toast'

export interface UseClientListOptions<T> {
  fetchFn: () => Promise<T[]>
  pageSize?: number
  filterFn?: (items: T[], search: string) => T[]
  deps?: React.DependencyList
}

export interface UseClientListResult<T> {
  data: T[]
  allData: T[]
  rawData: T[]
  loading: boolean
  error: string | null
  page: number
  totalItems: number
  totalPages: number
  setPage: (page: number) => void
  search: string
  setSearch: (search: string) => void
  refresh: () => void
  adjustPageOnDelete: () => void
}

export function makeTextFilter<T>(fields: (keyof T)[]) {
  return (items: T[], search: string): T[] => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      fields.some((field) => {
        const value = item[field]
        if (value == null) return false
        return String(value).toLowerCase().includes(q)
      }),
    )
  }
}

export function useClientList<T>(
  options: UseClientListOptions<T>,
): UseClientListResult<T> {
  const { fetchFn, pageSize = DEFAULT_CLIENT_PAGE_SIZE, filterFn, deps = [] } = options
  const { addToast } = useGlobalToast()

  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn

  const [rawData, setRawData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const prevSearchRef = useRef(search)
  useEffect(() => {
    if (prevSearchRef.current === search) return
    prevSearchRef.current = search
    setPage(1)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchFnRef.current()
      setRawData(data)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Sesi berakhir. Silakan masuk kembali.')
      } else if (err instanceof Error && 'status' in err) {
        setError('Backend tidak tersedia. Periksa koneksi lalu coba lagi.')
        addToast({ type: 'error', message: 'Backend tidak tersedia. Coba lagi.' })
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Gagal memuat data. Coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }, [addToast, refreshKey, ...deps])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () => (filterFn ? filterFn(rawData, search) : rawData),
    [filterFn, rawData, search],
  )

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const data = useMemo(
    () => filtered.slice(start, start + pageSize),
    [filtered, safePage, pageSize],
  )

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const adjustPageOnDelete = useCallback(() => {
    if (page > 1 && data.length === 0) {
      setPage((p) => Math.max(1, p - 1))
    } else {
      refresh()
    }
  }, [data.length, page, refresh])

  return {
    data,
    allData: filtered,
    rawData,
    loading,
    error,
    page: safePage,
    totalItems,
    totalPages,
    setPage,
    search,
    setSearch,
    refresh,
    adjustPageOnDelete,
  }
}
