import { useState, useEffect, useCallback } from 'react'
import { ConnectionStatus } from '../../core/types/enums'
import { backendClient } from '../../core/services/backendClient'
import { syncManager } from '../../core/services/sync/syncManager'

interface UseConnectionStatusResult {
  status: ConnectionStatus
  pendingSyncCount: number
}

export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.OFFLINE)
  const [pendingSyncCount, setPendingSyncCount] = useState(0)

  const checkConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus(ConnectionStatus.OFFLINE)
      return
    }

    if (!backendClient.isBackendEnabled()) {
      setStatus(ConnectionStatus.OFFLINE)
      return
    }

    try {
      const isHealthy = await backendClient.healthCheck()
      if (isHealthy) {
        setStatus(ConnectionStatus.CLOUD)
      } else {
        setStatus(ConnectionStatus.EDGE)
      }
    } catch {
      setStatus(ConnectionStatus.EDGE)
    }

    try {
      const count = await syncManager.getPendingCount()
      setPendingSyncCount(count)
    } catch {
      setPendingSyncCount(0)
    }
  }, [])

  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, 60000)
    return () => clearInterval(interval)
  }, [checkConnection])

  return { status, pendingSyncCount }
}
