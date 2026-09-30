import { useEffect, useMemo, useState } from 'react'
import { openSSE } from '../../core/services/backend-client'
import type { ConsentProgressEvent } from '../../core/services/types'

const OPEN_TIMEOUT_MS = 3000

export interface ConsentBatchTotals {
  sent: number
  failed: number
  total: number
}

export interface ConsentProgressState {
  // Increments once per `progress` event across all watched batches — callers
  // use it as a trigger to refetch server state.
  progressCount: number
  // Totals aggregated across every `done` event seen this cycle.
  summary: ConsentBatchTotals
  // True once EVERY currently active batch has emitted `done`.
  allDone: boolean
  connected: boolean
  // True when any stream errored or did not open within OPEN_TIMEOUT_MS —
  // callers must fall back to polling while batches remain active.
  failed: boolean
}

// Subscribes to the WhatsApp consent-delivery SSE stream for ALL active batch
// ids (one EventSource per batch). batchIds drives the subscription; an empty
// array means inactive. No state survives between subscription cycles beyond
// `done` totals, which reset once no batches are active.
export function useConsentProgress(batchIds: readonly string[]): ConsentProgressState {
  const [progressCount, setProgressCount] = useState(0)
  const [doneData, setDoneData] = useState<Partial<Record<string, ConsentProgressEvent['data']>>>({})
  const [connected, setConnected] = useState(false)
  const [failed, setFailed] = useState(false)

  const key = batchIds.join('|')
  const ids = useMemo(() => (key ? key.split('|') : []), [key])

  useEffect(() => {
    if (ids.length === 0) {
      setDoneData((prev) => (Object.keys(prev).length > 0 ? {} : prev))
      setProgressCount((prev) => (prev !== 0 ? 0 : prev))
      setConnected(false)
      setFailed(false)
      return
    }

    const opened = new Set<string>()
    const failedIds = new Set<string>()
    const timers: Record<string, number> = {}
    const sources: Record<string, EventSource> = {}

    for (const id of ids) {
      const path = `/api/consent/send-whatsapp/stream?batch_id=${encodeURIComponent(id)}`
      let source: EventSource
      try {
        source = openSSE(
          path,
          () => {
            // Default (unnamed) events are unused; named "progress"/"done"
            // events are handled via addEventListener below.
          },
          {
            onError: () => {
              // Any stream error (initial failure or dropped connection) opens
              // the polling fallback until the stream recovers or batches end.
              failedIds.add(id)
              setFailed(true)
              setConnected(false)
            },
          },
        )
      } catch (err) {
        // Synchronous open failure (e.g. EventSource construction throws):
        // same fallback as an open error — mark failed, never crash silently.
        console.warn('[useConsentProgress] failed to open progress stream for batch', id, err)
        failedIds.add(id)
        setFailed(true)
        setConnected(false)
        continue
      }
      sources[id] = source

      // Not open within OPEN_TIMEOUT_MS → same fallback as an open error.
      timers[id] = window.setTimeout(() => {
        if (!opened.has(id)) {
          failedIds.add(id)
          setFailed(true)
        }
      }, OPEN_TIMEOUT_MS)

      source.onopen = () => {
        window.clearTimeout(timers[id])
        opened.add(id)
        failedIds.delete(id)
        setFailed(failedIds.size > 0)
        setConnected(true)
      }

      // The backend emits NAMED SSE events (event: progress / event: done),
      // which only fire via addEventListener — source.onmessage only receives
      // the default unnamed "message" event. Register both explicitly.
      const handleProgress = (event: MessageEvent) => {
        try {
          JSON.parse(event.data)
        } catch (err) {
          console.warn('[useConsentProgress] malformed progress event', err)
          return
        }
        setProgressCount((prev) => prev + 1)
      }
      const handleDone = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data)
          setDoneData((prev) => ({ ...prev, [id]: parsed }))
        } catch (err) {
          // Mark the batch done anyway — the stream said "done"; the payload
          // was unreadable. Totals for it come from the next flat refetch.
          console.warn('[useConsentProgress] malformed done event', err)
          setDoneData((prev) => ({ ...prev, [id]: {} }))
        }
        window.clearTimeout(timers[id])
        source.close()
      }
      source.addEventListener('progress', handleProgress as EventListener)
      source.addEventListener('done', handleDone as EventListener)
    }

    return () => {
      for (const id of Object.keys(timers)) window.clearTimeout(timers[id])
      for (const id of Object.keys(sources)) sources[id].close()
    }
  }, [ids])

  const summary = useMemo(() => {
    const totals: ConsentBatchTotals = { sent: 0, failed: 0, total: 0 }
    for (const data of Object.values(doneData)) {
      if (!data) continue
      totals.sent += data.sent ?? 0
      totals.failed += data.failed ?? 0
      totals.total += data.total ?? 0
    }
    return totals
  }, [doneData])

  const allDone = ids.length > 0 && ids.every((id) => doneData[id] !== undefined)

  return { progressCount, summary, allDone, connected, failed }
}
