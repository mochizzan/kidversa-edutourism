import { useState, useEffect, useCallback } from 'react'
import { backendClient } from '../../core/services/backendClient'

interface UseConnectionStatusResult {
  status: 'online' | 'degraded' | 'reconnecting'
}

// Subscribes to the module-level connection store kept by backendClient
// (online | degraded | reconnecting). The old IndexedDB pending-sync count is
// gone — the backend is the single source of truth.
export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<'online' | 'degraded' | 'reconnecting'>(
    backendClient.getConnection(),
  )

  const sync = useCallback(() => {
    setStatus(backendClient.getConnection())
  }, [])

  useEffect(() => {
    const unsub = backendClient.subscribeConnection(sync)
    return unsub
  }, [sync])

  return { status }
}
