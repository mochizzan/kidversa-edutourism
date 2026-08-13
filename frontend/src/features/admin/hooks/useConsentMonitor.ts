import { useState, useEffect, useCallback, useRef } from 'react'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { sessionService } from '../../../core/services/sessions'
import { consentService } from '../../../core/services/consent'
import { ApiError } from '../../../core/services/backendClient'
import { useConsentProgress } from '../../../shared/hooks/useConsentProgress'
import type { Session, Participant, ConsentLog } from '../../../core/types'
import { ConsentType } from '../../../core/types'

export interface SessionConsentData {
  session: Session
  participants: Participant[]
  logs: ConsentLog[]
  consentedRecording: number
  consentedPhoto: number
  pendingCount: number
}

export type ConsentStatus = 'not_sent' | 'pending' | 'granted' | 'denied'

export function useConsentMonitor() {
  const { addToast } = useGlobalToast()

  const [sessions, setSessions] = useState<Session[]>([])
  const [consentData, setConsentData] = useState<Record<string, SessionConsentData>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [activeBatch, setActiveBatch] = useState<{
    sessionId: string
    batchId: string
    total: number
  } | null>(null)

  const { progress, connected } = useConsentProgress(activeBatch?.batchId ?? null)
  const sseEverConnected = useRef(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sessionService.getAll({ limit: 100 })
      const loadedSessions = res.data
      setSessions(loadedSessions)

      if (loadedSessions.length === 0) {
        setConsentData({})
        return
      }

      const consentMap = await consentService.getSummary(loadedSessions.map((s) => s.id))

      const participantResults = await Promise.all(
        loadedSessions.map((s) => sessionService.getParticipants(s.id)),
      )

      const dataMap: Record<string, SessionConsentData> = {}
      loadedSessions.forEach((session, i) => {
        const participants = participantResults[i]
        const logs = consentMap[session.id] ?? []

        const consentedRecording = participants.filter((p) =>
          logs.some(
            (l) =>
              l.participant_id === p.id && l.consent_type === ConsentType.RECORDING && l.value,
          ),
        ).length

        const consentedPhoto = participants.filter((p) =>
          logs.some(
            (l) => l.participant_id === p.id && l.consent_type === ConsentType.PHOTO && l.value,
          ),
        ).length

        const pendingCount = participants.filter((p) => {
          const hasRecording = logs.some(
            (l) =>
              l.participant_id === p.id &&
              l.consent_type === ConsentType.RECORDING &&
              l.responded_at,
          )
          const hasPhoto = logs.some(
            (l) =>
              l.participant_id === p.id && l.consent_type === ConsentType.PHOTO && l.responded_at,
          )
          return !hasRecording || !hasPhoto
        }).length

        dataMap[session.id] = {
          session,
          participants,
          logs,
          consentedRecording,
          consentedPhoto,
          pendingCount,
        }
      })

      setConsentData(dataMap)
    } catch {
      setError('Gagal memuat data consent')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (connected) sseEverConnected.current = true
  }, [connected])

  useEffect(() => {
    if (activeBatch && sseEverConnected.current && !connected && progress?.type !== 'done') {
      addToast({
        type: 'warning',
        message: 'Koneksi SSE terputus. Klik "Kirim via WhatsApp" untuk mengulang.',
      })
      setActiveBatch(null)
    }
  }, [connected, activeBatch, progress, addToast])

  useEffect(() => {
    if (!activeBatch) return
    if (progress?.type === 'done') {
      addToast({
        type: 'success',
        message: `Pengiriman selesai: ${progress.data.sent ?? 0}/${progress.data.total ?? 0} peserta`,
      })
      setActiveBatch(null)
      loadData()
    }
  }, [progress, activeBatch, addToast, loadData])

  const handleSendWhatsApp = useCallback(
    async (sessionId: string, force = false) => {
      setSending((prev) => ({ ...prev, [sessionId]: true }))
      try {
        const res = await consentService.sendViaWhatsApp(sessionId, force)
        setActiveBatch({ sessionId, batchId: res.batch_id, total: res.total })
        addToast({
          type: 'info',
          message: force
            ? `Mengirim ulang permintaan consent via WhatsApp ke ${res.total} peserta...`
            : `Mengirim permintaan consent via WhatsApp ke ${res.total} peserta...`,
        })
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Gagal mengirim permintaan consent'
        addToast({ type: 'error', message })
      } finally {
        setSending((prev) => ({ ...prev, [sessionId]: false }))
      }
    },
    [addToast],
  )

  const getConsentStatus = useCallback(
    (participantId: string, consentType: ConsentType, logs: ConsentLog[]): ConsentStatus => {
      const log = logs.find(
        (l) => l.participant_id === participantId && l.consent_type === consentType,
      )
      if (!log) return 'not_sent'
      if (!log.responded_at) return 'pending'
      return log.value ? 'granted' : 'denied'
    },
    [],
  )

  const toggleSession = useCallback((sessionId: string) => {
    setExpandedSession((prev) => (prev === sessionId ? null : sessionId))
  }, [])

  return {
    sessions,
    consentData,
    loading,
    error,
    expandedSession,
    sending,
    activeBatch,
    progress,
    loadData,
    handleSendWhatsApp,
    getConsentStatus,
    toggleSession,
  }
}
