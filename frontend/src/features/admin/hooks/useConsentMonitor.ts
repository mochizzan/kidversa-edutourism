import { useState, useEffect, useCallback, useMemo } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { consentService } from '../../../core/services/consent'
import { i18n } from '../../../core/i18n'
import { useConsentProgress } from '../../../shared/hooks/useConsentProgress'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { ConsentFlatItem } from '../../../core/types'

export type ConsentStatus = 'not_sent' | 'pending' | 'granted' | 'denied'

const PAGE_SIZE = DEFAULT_CLIENT_PAGE_SIZE

export interface ConsentFlatData {
  items: ConsentFlatItem[]
  filtered: ConsentFlatItem[]
  paged: ConsentFlatItem[]
  loading: boolean
  error: string | null
  search: string
  setSearch: (s: string) => void
  filterStatus: ConsentStatus | 'all'
  setFilterStatus: (f: ConsentStatus | 'all') => void
  page: number
  setPage: (p: number) => void
  pageSize: number
  totalPages: number
  totalItems: number
  sendSingle: (participantId: string, force?: boolean) => Promise<void>
  sendAll: () => Promise<void>
  refresh: () => Promise<void>
  sending: Record<string, boolean>
  batchSending: boolean
  activeBatch: string | null
  progress: { sent: number; failed: number; total: number }
}

export function useConsentMonitor(): ConsentFlatData {
  const { addToast } = useGlobalToast()

  const [items, setItems] = useState<ConsentFlatItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ConsentStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [activeBatch, setActiveBatch] = useState<string | null>(null)

  const { progress, connected } = useConsentProgress(activeBatch)

  // Reset page when search or filter changes
  useEffect(() => {
    setPage(1)
  }, [search, filterStatus])

  // Client-side filtered list
  const filtered = useMemo(() => {
    let result = items

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((item) => item.child_name.toLowerCase().includes(q))
    }

    if (filterStatus !== 'all') {
      result = result.filter((item) => item.consent_status === filterStatus)
    }

    return result
  }, [items, search, filterStatus])

  // Client-side pagination
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const totalPages = useMemo(() => Math.ceil(filtered.length / PAGE_SIZE), [filtered])

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await consentService.getFlat()
      setItems(data)
    } catch {
      setError(i18n.t('admin.consent.loadError'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle SSE completion
  useEffect(() => {
    if (progress?.type === 'done') {
      addToast({
        type: 'success',
        message: i18n.t('admin.consent.batchDone', { sent: progress.data.sent ?? 0, total: progress.data.total ?? 0 }),
      })
      setActiveBatch(null)
      loadData()
    }
  }, [progress, addToast, loadData])

  // Handle SSE disconnection
  useEffect(() => {
    if (activeBatch && !connected && progress?.type !== 'done') {
      // Connection lost but we still have an active batch — let the progress handle it
    }
  }, [connected, activeBatch, progress])

  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  const sendSingle = useCallback(
    async (participantId: string, force = false) => {
      setSending((prev) => ({ ...prev, [participantId]: true }))
      try {
        await consentService.sendSingle(participantId, force)
        addToast({ type: 'success', message: i18n.t('admin.consent.sendOkToast') })
        await loadData()
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : i18n.t('admin.consent.sendErrorToast')
        addToast({ type: 'error', message })
      } finally {
        setSending((prev) => {
          const next = { ...prev }
          delete next[participantId]
          return next
        })
      }
    },
    [addToast, loadData],
  )

  const sendAll = useCallback(async () => {
    // Collect unique session_ids from eligible participants
    const eligibleSessionIds = [
      ...new Set(
        filtered
          .filter(
            (item) =>
              item.consent_status === 'not_sent' || item.consent_status === 'pending',
          )
          .map((item) => item.session_id),
      ),
    ]

    if (eligibleSessionIds.length === 0) {
      addToast({
        type: 'warning',
        message: i18n.t('admin.consent.noneEligibleToast'),
      })
      return
    }

    // Count eligible participants
    const eligibleCount = filtered.filter(
      (item) =>
        item.consent_status === 'not_sent' || item.consent_status === 'pending',
    ).length

    addToast({
      type: 'info',
      message: i18n.t('admin.consent.sendingCount', { count: eligibleCount }),
    })

    // Send batch for each session
    for (const sessionId of eligibleSessionIds) {
      try {
        const res = await consentService.sendViaWhatsApp(sessionId, true)
        if (!activeBatch) {
          setActiveBatch(res.batch_id)
        }
      } catch {
        // Individual session failures are logged but don't stop the loop
      }
    }
  }, [filtered, addToast, activeBatch])

  return {
    items,
    filtered,
    paged,
    loading,
    error,
    search,
    setSearch,
    filterStatus,
    setFilterStatus,
    page,
    setPage,
    pageSize: PAGE_SIZE,
    totalPages,
    totalItems: filtered.length,
    sendSingle,
    sendAll,
    refresh,
    sending,
    batchSending: activeBatch !== null && progress?.type !== 'done',
    activeBatch,
    progress: progress?.type === 'done'
      ? { sent: progress.data.sent ?? 0, failed: progress.data.failed ?? 0, total: progress.data.total ?? 0 }
      : progress?.type === 'progress'
        ? { sent: 0, failed: 0, total: 0 }
        : { sent: 0, failed: 0, total: 0 },
  }
}
