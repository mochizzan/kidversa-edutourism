import { useState, useEffect, useCallback } from 'react'
import { ConnectionStatus } from '../../core/types/enums'

interface UseConnectionStatusResult {
  status: ConnectionStatus
}

export function useConnectionStatus(): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.CLOUD)

  const checkConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setStatus(ConnectionStatus.OFFLINE)
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      const response = await fetch('/health', { method: 'GET', signal: controller.signal })
      clearTimeout(timeoutId)

      if (response.ok) {
        setStatus(ConnectionStatus.CLOUD)
      } else {
        setStatus(ConnectionStatus.EDGE)
      }
    } catch {
      setStatus(navigator.onLine ? ConnectionStatus.EDGE : ConnectionStatus.OFFLINE)
    }
  }, [])

  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [checkConnection])

  return { status }
}
