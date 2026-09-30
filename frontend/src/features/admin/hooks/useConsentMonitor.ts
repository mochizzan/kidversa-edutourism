import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { consentService } from '../../../core/services/consent'
import { ApiError } from '../../../core/services/backend-client'
import { i18n } from '../../../core/i18n'
import { useConsentProgress } from '../../../shared/hooks/useConsentProgress'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { ConsentFlatItem } from '../../../core/types'
import type { ConsentActiveBatch, ConsentFlatExtras } from '../../../core/services/types'

export type ConsentStatus = 'not_sent' | 'pending' | 'granted' | 'denied'

const PAGE_SIZE = DEFAULT_CLIENT_PAGE_SIZE
const FALLBACK_POLL_MS = 3000

// A batch cycle's final status check (flat refetch after the send POSTs or an
// SSE `done`) can fail or return an invalid payload. The bulk button must then
// neither spin forever nor flip to idle without server confirmation: keep the
// last-known spinner while retrying, surface every failure, and after
// STATUS_CHECK_MAX_FAILURES consecutive bad checks stop the spinner into a
// surfaced, retryable error state (`statusCheckFailed`). Idle is only ever
// reached by a clean server response whose batches are all terminal.
const STATUS_CHECK_MAX_FAILURES = 5
const STATUS_CHECK_RETRY_MS = 3000

// Structural check for one `active_batches` entry — the server contract is a
// batch_id plus finite, non-negative counters that can't exceed the batch size.
function isWellFormedBatch(v: unknown): v is ConsentActiveBatch {
  if (typeof v !== 'object' || v === null) return false
  const { batch_id: id, total, sent, failed } = v as Record<string, unknown>
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof total === 'number' &&
    Number.isFinite(total) &&
    total >= 0 &&
    typeof sent === 'number' &&
    Number.isFinite(sent) &&
    sent >= 0 &&
    typeof failed === 'number' &&
    Number.isFinite(failed) &&
    failed >= 0 &&
    sent + failed <= total
  )
}

// The backend RETAINS completed batches in `active_batches` (bounded registry,
// newest ~20) next to running ones, so presence alone never means "running":
// a batch is terminal only when every member reached a terminal delivery
// status (sent+failed === total). Malformed entries are NEVER terminal — a
// broken payload must not read as "selesai".
function isTerminalBatch(b: ConsentActiveBatch): boolean {
  return isWellFormedBatch(b) && b.sent + b.failed >= b.total
}

// Validates the flat envelope's active_batches before it may drive the UI.
// `malformed === null` means the payload matched the contract; otherwise it
// carries the offending value for logging. Invalid entries are dropped from
// state (they would crash rendering) while the caller flags them via
// `invalidActiveBatches` so they keep the button in progress until the
// failure cap turns that into the surfaced error state.
function parseActiveBatches(extras: ConsentFlatExtras): {
  batches: ConsentActiveBatch[]
  malformed: unknown
} {
  const raw: unknown = extras.active_batches
  if (raw === undefined || raw === null) return { batches: [], malformed: null }
  if (!Array.isArray(raw)) return { batches: [], malformed: raw }
  const batches: ConsentActiveBatch[] = []
  const invalid: unknown[] = []
  for (const entry of raw) {
    if (isWellFormedBatch(entry)) batches.push(entry)
    else invalid.push(entry)
  }
  return { batches, malformed: invalid.length > 0 ? invalid : null }
}

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
  // Bulk-send button state: true while the optimistic send is unconfirmed, the
  // server reports a non-terminal batch, or the last payload couldn't be
  // parsed. False (idle) only when a clean server response shows every watched
  // batch terminal — or when statusCheckFailed stopped the spinner into the
  // surfaced error state (never a silent, endless spinner).
  batchSending: boolean
  // STATUS_CHECK_MAX_FAILURES consecutive failed/invalid status checks: the
  // bulk button stopped spinning and shows a retryable error instead. Recovery
  // happens only via a clean server response — never assumed "done".
  statusCheckFailed: boolean
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
  // Latest flat payload failed contract validation (see parseActiveBatches):
  // held open so the button neither reads it as done nor spins past the cap.
  const [invalidActiveBatches, setInvalidActiveBatches] = useState(false)
  const [statusCheckFailed, setStatusCheckFailed] = useState(false)
  const fallbackWarnedRef = useRef(false)
  const batchDoneHandledRef = useRef(false)
  // Batch ids seen by the last successful flat fetch. active_batches going
  // from watched-non-empty to empty WITHOUT observed completion (SSE `done`
  // for every watched batch, or terminal delivery rows) means the server-side
  // operation stopped (restart / registry eviction) — never a silent "done".
  const prevActiveIdsRef = useRef<string[]>([])
  // Mirrors `allDone` for use inside the stable loadData callback.
  const allDoneRef = useRef(false)
  // ── Status-check health (bounded spinner, see STATUS_CHECK_MAX_FAILURES) ──
  // Consecutive failed/invalid flat status checks.
  const failuresRef = useRef(0)
  // Ref mirror of `statusCheckFailed` so the stable callbacks can read it
  // without re-creating themselves (which would re-trigger the mount load).
  const statusCheckFailedRef = useRef(false)
  // True while an unconfirmed batch cycle is being watched (optimistic send or
  // last-known non-terminal batches) — gates whether a failed check retries.
  const awaitingRef = useRef(false)
  // The SSE fallback interval is polling right now (avoids a second cadence).
  const pollingRef = useRef(false)
  const retryTimerRef = useRef<number | null>(null)
  // Always-latest loadData for timers scheduled by an older render.
  const loadDataRef = useRef<(opts?: { background?: boolean }) => Promise<void>>(
    async () => { },
  )

  const batchIds = useMemo(() => activeBatches.map((b) => b.batch_id), [activeBatches])
  const { progressCount, summary, allDone, failed: sseFailed } = useConsentProgress(batchIds)

  // Server truth for the bulk button: a retained batch keeps the spinner only
  // while any member is still queued/processing (sent+failed < total).
  // COMPLETED batches stay in active_batches (registry retention), so they are
  // terminal here and must not drive the spinner — that was the endless
  // "kirim semua" progress-circular bug.
  const openBatches = useMemo(
    () => activeBatches.filter((b) => !isTerminalBatch(b)),
    [activeBatches],
  )
  const hasOpenBatch = invalidActiveBatches || openBatches.length > 0

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

  // Counts one failed/invalid status check. The call site already logs the
  // underlying error (background warn / malformed-payload console.error); the
  // cap additionally stops auto-retries, logs, and toasts so a stopped spinner
  // is always explained — never a silent, endless progress circular.
  const bumpStatusCheckFailure = useCallback(() => {
    failuresRef.current += 1
    if (failuresRef.current < STATUS_CHECK_MAX_FAILURES || statusCheckFailedRef.current) {
      return
    }
    statusCheckFailedRef.current = true
    setStatusCheckFailed(true)
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }
    console.error(
      '[useConsentMonitor] consent status check failed repeatedly — stopping bulk-send progress until a clean server response arrives',
    )
    addToast({ type: 'error', message: i18n.t('admin.consent.loadError') })
  }, [addToast])

  // One-shot bounded re-check after a failed/invalid status check, unless the
  // SSE fallback interval already polls (no second cadence) or the cap was
  // reached (the surfaced error state waits for the manual Retry).
  const scheduleStatusRetry = useCallback(() => {
    if (failuresRef.current >= STATUS_CHECK_MAX_FAILURES) return
    if (retryTimerRef.current !== null || pollingRef.current) return
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null
      if (!awaitingRef.current || failuresRef.current >= STATUS_CHECK_MAX_FAILURES) return
      void loadDataRef.current({ background: true })
    }, STATUS_CHECK_RETRY_MS)
  }, [])

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
      const { batches: nextBatches, malformed } = parseActiveBatches(extras)

      if (malformed !== null) {
        // Invalid server response for the status check: surfaced (log + capped
        // error state), never silent, and never read as "everything is done".
        // The optimistic overlay also survives — only a clean response clears
        // it — so the button stays in progress until the cap bounds it.
        console.error(
          '[useConsentMonitor] malformed active_batches payload in flat response',
          malformed,
        )
        bumpStatusCheckFailure()
        setInvalidActiveBatches(true)
        scheduleStatusRetry()
        setItems(flatItems)
        setActiveBatches(nextBatches)
        awaitingRef.current = true
        return
      }

      // Clean response: reset the consecutive-failure budget and lift a
      // previously surfaced stop — the button re-derives from server truth.
      failuresRef.current = 0
      setInvalidActiveBatches(false)
      if (statusCheckFailedRef.current) {
        statusCheckFailedRef.current = false
        setStatusCheckFailed(false)
      }

      setItems(flatItems)
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

      // Server state (or its absence) wins over the optimistic overlay — but
      // only a CLEAN response clears it: a failed final status check keeps the
      // button in progress (retries bounded by STATUS_CHECK_MAX_FAILURES)
      // instead of silently dropping back to idle while the server may run.
      setBatchOptimistic(false)
      awaitingRef.current = nextBatches.some((b) => !isTerminalBatch(b))
      if (!awaitingRef.current && retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        // Endpoint gone: surface through the existing error UI (with Retry)
        // and stop the SSE fallback poll — never loop against a dead route.
        console.warn('[useConsentMonitor] flat endpoint returned 404; halting fallback polling', err)
        setError(i18n.t('admin.consent.loadError'))
      } else if (background) {
        console.warn('[useConsentMonitor] background flat refresh failed', err)
        bumpStatusCheckFailure()
        scheduleStatusRetry()
      } else {
        setError(i18n.t('admin.consent.loadError'))
      }
    } finally {
      if (!background) setLoading(false)
    }
  }, [addToast, bumpStatusCheckFailure, scheduleStatusRetry])

  loadDataRef.current = loadData

  // Unmount: never let a pending status-check retry fire into a dead hook.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current)
    }
  }, [])

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

  // Fallback: SSE errored or never opened while a batch is still running →
  // poll the flat endpoint until the server reports every batch terminal.
  // Gated on `error === null` (a dead 404 endpoint halts the poll instead of
  // error-looping; a successful Retry re-arms it), on `!statusCheckFailed`
  // (capped checks stop auto-polling — the surfaced Retry resumes it) and on
  // open batches so retained COMPLETED batches don't poll forever either.
  const sseFallback = sseFailed && hasOpenBatch && error === null && !statusCheckFailed
  useEffect(() => {
    if (!sseFallback) return
    pollingRef.current = true
    if (!fallbackWarnedRef.current) {
      fallbackWarnedRef.current = true
      console.warn(
        '[useConsentMonitor] SSE progress stream unavailable — polling /api/consent/flat every 3s while batches are active',
      )
    }
    const timer = window.setInterval(() => {
      void loadData({ background: true })
    }, FALLBACK_POLL_MS)
    return () => {
      window.clearInterval(timer)
      pollingRef.current = false
    }
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
    // awaitingRef flips immediately so a FAILED confirmation check retries the
    // status check instead of dropping the button back to idle; both clear
    // only on a clean response (see loadData).
    setBatchOptimistic(true)
    awaitingRef.current = true

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
    // Spinner only while the send is unconfirmed or the server still reports
    // (or fails to report) a non-terminal batch; statusCheckFailed has already
    // stopped it into the surfaced error state — idle is server-confirmed.
    batchSending: !statusCheckFailed && (batchOptimistic || hasOpenBatch),
    statusCheckFailed,
  }
}
