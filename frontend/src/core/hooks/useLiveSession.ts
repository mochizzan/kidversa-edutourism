import { useState, useEffect, useCallback, useRef } from 'react'

export interface LiveSessionState {
  groups: Record<string, {
    id: string
    name: string
    currentStageId: string | null
    status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'
    participants: Array<{
      id: string
      childName: string
      ratingStatus: 'unrated' | 'rated'
    }>
  }>
  connectionStatus: 'online' | 'degraded' | 'reconnecting'
}

export function useLiveSession(sessionId: string) {
  const [state, setState] = useState<LiveSessionState>({
    groups: {},
    connectionStatus: 'online',
  })
  const intervalRef = useRef<number | null>(null)

  const simulateProgress = useCallback(() => {
    setState(prev => {
      const groups = { ...prev.groups }
      const groupIds = Object.keys(groups)

      if (groupIds.length === 0) return prev

      // Simulate random group progress
      const randomGroupId = groupIds[Math.floor(Math.random() * groupIds.length)]
      const group = groups[randomGroupId]

      if (group && group.status !== 'COMPLETED') {
        groups[randomGroupId] = {
          ...group,
          status: 'IN_PROGRESS',
        }
      }

      return { ...prev, groups }
    })
  }, [])

  useEffect(() => {
    setState(prev => ({ ...prev, connectionStatus: 'online' }))

    // Simulate real-time updates every 10 seconds
    intervalRef.current = window.setInterval(simulateProgress, 10000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [sessionId, simulateProgress])

  const unlockGroup = useCallback((groupId: string) => {
    setState(prev => {
      const groups = { ...prev.groups }
      if (groups[groupId]) {
        groups[groupId] = {
          ...groups[groupId],
          status: 'IN_PROGRESS',
        }
      }
      return { ...prev, groups }
    })
  }, [])

  const markGroupComplete = useCallback((groupId: string) => {
    setState(prev => {
      const groups = { ...prev.groups }
      if (groups[groupId]) {
        groups[groupId] = {
          ...groups[groupId],
          status: 'COMPLETED',
        }
      }
      return { ...prev, groups }
    })
  }, [])

  return {
    ...state,
    unlockGroup,
    markGroupComplete,
  }
}
