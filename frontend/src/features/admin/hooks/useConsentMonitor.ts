import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { consentService } from '../../../core/services/consent'
import { ApiError } from '../../../core/services/backend-client'
import { i18n } from '../../../core/i18n'
import { useConsentProgress } from '../../../shared/hooks/useConsentProgress'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { ConsentFlatItem } from '../../../core/types'
import type { ConsentActiveBatch } from '../../../core/services/types'

export type ConsentStatus = 'not_sent' | 'pending' | 'granted' | 'denied'

const PAGE_SIZE = DEFAULT_CLIENT_PAGE_SIZE
const FALLBACK_POLL_MS = 3000

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
  // True while server batches are active (server-derived via active_batches)
  // or between our own POST 202 and the next flat refetch (optimistic overlay).
  batchSending: boolean
}

// Server-driven consent monitor. All delivery state (per-row delivery_status
// and active_batches) is refetched from the flat endpoint on every mount and
// refresh — nothing is persisted locally, so navigation/logout/browser restart
// all land on honest server truth.
export function useConsentMonitor(): ConsentFlatData {
  const { addToast } = useGlobalToast()

  const [items, setItems] = useState<ConsentFlatItem[]>([])
  const [activeBatches, setActiveBatches] = useState<ConsentActiveBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ConsentStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [batchOptimistic, setBatchOptimistic] = useState(false)
  const fallbackWarnedRef = useRef(false)
  const batchDoneHandledRef = useRef(false)
  // Batch ids seen by the last successful flat fetch. active_batches going
  // from watched-non-empty to empty WITHOUT observed completion (SSE `done`
  // for every watched batch, or terminal delivery rows) means the server-side
  // operation stopped (restart / registry eviction) — never a silent "done".
  const prevActiveIdsRef = useRef<string[]>([])
  // Mirrors `allDone` for use inside the stable loadData callback.
  const allDoneRef = useRef(false)

  const batchIds = useMemo(() => activeBatches.map((b) => b.batch_id), [activeBatches])
  const { progressCount, summary, allDone, failed: sseFailed } = useConsentProgress(batchIds)

  useEffect(() => {
    allDoneRef.current = allDone
  }, [allDone])

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

  // Load data. Foreground (default) shows the full loading state and surfaces
  // errors; background refreshes keep the last known UI and warn instead.
  const loadData = useCallback(async (opts?: { background?: boolean }): Promise<void> => {
    const background = opts?.background === true
    if (!background) {
      setLoading(true)
      setError(null)
    }
    try {
      const { items: flatItems, extras } = await consentService.getFlat()
      setItems(flatItems)
      const nextBatches = extras.active_batches ?? []
      setActiveBatches(nextBatches)

      // Server restart / registry loss mid-watch: active_batches vanished
      // before completion was observed (no SSE `done` for every watched batch
      // and no terminal delivery rows). One-shot warning toast + refetch —
      // refs are updated FIRST so the transition can only fire once.
      const watched = prevActiveIdsRef.current
      const vanished = watched.length > 0 && nextBatches.length === 0
      prevActiveIdsRef.current = nextBatches.map((b) => b.batch_id)
      const completionObserved =
        allDoneRef.current ||
        flatItems.some((i) => i.delivery_status === 'sent' || i.delivery_status === 'failed')
      if (vanished && !completionObserved) {
        addToast({ type: 'warning', message: i18n.t('admin.status.operationInterrupted') })
        void loadData({ background: true }) // confirm against a fresh fetch (no loop: refs already advanced)
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        // Endpoint gone: surface through the existing error UI (with Retry)
        // and stop the SSE fallback poll — never loop against a dead route.
        console.warn('[useConsentMonitor] flat endpoint returned 404; halting fallback polling', err)
        setError(i18n.t('admin.consent.loadError'))
      } else if (background) {
        console.warn('[useConsentMonitor] background flat refresh failed', err)
      } else {
        setError(i18n.t('admin.consent.loadError'))
      }
    } finally {
      // Server state (or its absence) wins over the optimistic overlay.
      setBatchOptimistic(false)
      if (!background) setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // SSE: every active batch emitted `done` → toast + refetch; the terminal
  // delivery_status (sent|failed) then renders rows back as "Kirim Ulang".
  useEffect(() => {
    if (!allDone) {
      batchDoneHandledRef.current = false
      return
    }
    if (batchDoneHandledRef.current) return
    batchDoneHandledRef.current = true
    addToast({
      type: 'success',
      message: i18n.t('admin.consent.batchDone', { sent: summary.sent, total: summary.total }),
    })
    void loadData({ background: true })
  }, [allDone, summary, addToast, loadData])

  // SSE: each progress event → refresh so per-row delivery_status transitions
  // (queued → processing → sent/failed) track the server as the batch runs.
  useEffect(() => {
    if (progressCount > 0 && activeBatches.length > 0) {
      void loadData({ background: true })
    }
  }, [progressCount, activeBatches.length, loadData])

  // Fallback: SSE errored or never opened while batches are still active →
  // poll the flat endpoint until the server reports no active batches. Gated
  // on `error === null` so a dead endpoint (404) halts the poll instead of
  // error-looping; a successful Retry re-arms it.
  const sseFallback = sseFailed && activeBatches.length > 0 && error === null
  useEffect(() => {
    if (!sseFallback) return
    if (!fallbackWarnedRef.current) {
      fallbackWarnedRef.current = true
      console.warn(
        '[useConsentMonitor] SSE progress stream unavailable — polling /api/consent/flat every 3s while batches are active',
      )
    }
    const timer = window.setInterval(() => {
      void loadData({ background: true })
    }, FALLBACK_POLL_MS)
    return () => window.clearInterval(timer)
  }, [sseFallback, loadData])

  const refresh = useCallback(async () => {
    await loadData()
  }, [loadData])

  const sendSingle = useCallback(
    async (participantId: string, force = false) => {
      setSending((prev) => ({ ...prev, [participantId]: true }))
      try {
        await consentService.sendSingle(participantId, force)
        addToast({ type: 'success', message: i18n.t('admin.consent.sendOkToast') })
        await loadData({ background: true })
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

    // Optimistic overlay: progress mode between the 202s and the refetch.
    setBatchOptimistic(true)

    // Send batch for each session
    for (const sessionId of eligibleSessionIds) {
      try {
        await consentService.sendViaWhatsApp(sessionId, true)
      } catch (err) {
        // Individual session failures are logged but don't stop the loop
        console.warn('[useConsentMonitor] sendViaWhatsApp failed', err)
      }
    }

    // Server registers batches synchronously before the 202 returns, so this
    // refetch picks up active_batches + per-row delivery_status; from there
    // batchSending is server-derived and the optimistic flag is cleared.
    await loadData({ background: true })
  }, [filtered, addToast, loadData])

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
    batchSending: batchOptimistic || activeBatches.length > 0,
  }
}
