import { useEffect, useRef, useState } from 'react'
import { openSSE } from '../../core/services/backendClient'
import type { ConsentProgressEvent } from '../../core/services/types'

// useConsentProgress subscribes to the WhatsApp consent-delivery SSE stream for a
// batch and exposes the latest progress event plus connection state. When
// batchId is null the subscription is inactive.
export function useConsentProgress(batchId: string | null) {
  const [progress, setProgress] = useState<ConsentProgressEvent | null>(null)
  const [connected, setConnected] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!batchId) return
    setProgress(null)
    setConnected(false)

    const path = `/api/consent/send-whatsapp/stream?batch_id=${encodeURIComponent(batchId)}`
    const source = openSSE(path, () => {
      // Default (unnamed) events are not used here; named events "progress" and
      // "done" are dispatched via addEventListener below.
    }, {
      onError: () => setConnected(false),
    })
    source.onopen = () => setConnected(true)
    sourceRef.current = source

    // The backend emits NAMED SSE events (event: progress / event: done), which
    // only fire via addEventListener — source.onmessage only receives the
    // default unnamed "message" event. Register both explicitly.
    const handleProgress = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data)
        setProgress({ type: 'progress', data: parsed })
      } catch {
        // Ignore malformed events.
      }
    }
    const handleDone = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data)
        setProgress({ type: 'done', data: parsed })
      } catch {
        // Ignore malformed events.
      }
      source.close()
    }
    source.addEventListener('progress', handleProgress as EventListener)
    source.addEventListener('done', handleDone as EventListener)

    return () => {
      source.close()
      sourceRef.current = null
    }
  }, [batchId])

  return { progress, connected }
}
