import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { sessionService } from '../../../core/services/sessions'
import { consentService } from '../../../core/services/consent'
import type { Session, Participant, ConsentLog } from '../../../core/types'
import { ConsentType } from '../../../core/types'
import { formatDate, formatDateTime } from '../../../shared/utils'

interface SessionConsentData {
  session: Session
  participants: Participant[]
  logs: ConsentLog[]
  consentedRecording: number
  consentedPhoto: number
  pendingCount: number
}

const ConsentMonitorPage = () => {
  const { addToast } = useGlobalToast()

  const [sessions, setSessions] = useState<Session[]>([])
  const [consentData, setConsentData] = useState<Record<string, SessionConsentData>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sendingRequest, setSendingRequest] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await sessionService.getAll({ limit: 100 })
      setSessions(res.data)

      const dataMap: Record<string, SessionConsentData> = {}

      for (const session of res.data) {
        const participants = await sessionService.getParticipants(session.id)
        const logs = await consentService.getBySession(session.id)

        const consentedRecording = participants.filter(
          (p) => logs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.RECORDING && l.value)
        ).length

        const consentedPhoto = participants.filter(
          (p) => logs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.PHOTO && l.value)
        ).length

        const pendingCount = participants.filter((p) => {
          const hasRecording = logs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.RECORDING)
          const hasPhoto = logs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.PHOTO)
          return !hasRecording || !hasPhoto || !p.consent_at
        }).length

        dataMap[session.id] = {
          session,
          participants,
          logs,
          consentedRecording,
          consentedPhoto,
          pendingCount,
        }
      }

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

  const handleSendRequest = async (sessionId: string) => {
    setSendingRequest((prev) => ({ ...prev, [sessionId]: true }))
    try {
      await consentService.sendRequest(sessionId)
      addToast({ type: 'success', message: 'Permintaan consent berhasil dikirim' })
      // Reload data
      loadData()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengirim permintaan consent' })
    } finally {
      setSendingRequest((prev) => ({ ...prev, [sessionId]: false }))
    }
  }

  const handleResendParticipant = async (
    sessionId: string,
    _participantId: string,
    _participantName: string
  ) => {
    // Use session-level resend as a proxy for individual resend
    setSendingRequest((prev) => ({ ...prev, [sessionId]: true }))
    try {
      await consentService.sendRequest(sessionId)
      addToast({
        type: 'success',
        message: `Permintaan consent ulang dikirim ke ${_participantName}`,
      })
      loadData()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengirim ulang permintaan' })
    } finally {
      setSendingRequest((prev) => ({ ...prev, [sessionId]: false }))
    }
  }

  const getConsentStatus = (
    participantId: string,
    consentType: ConsentType,
    logs: ConsentLog[]
  ): 'granted' | 'denied' | 'pending' => {
    const log = logs.find(
      (l) => l.participant_id === participantId && l.consent_type === consentType
    )
    if (!log) return 'pending'
    if (log.responded_at) return log.value ? 'granted' : 'denied'
    return 'pending'
  }

  const toggleSession = (sessionId: string) => {
    setExpandedSession((prev) => (prev === sessionId ? null : sessionId))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitor Consent"
        subtitle="Pantau status persetujuan orang tua untuk setiap sesi."
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">Memuat data consent...</span>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-on-error-container" />
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadData}>
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          icon={<Shield className="w-12 h-12" />}
          title="Belum ada sesi"
          description="Belum ada sesi yang membutuhkan monitoring consent."
        />
      )}

      {/* Session List */}
      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => {
            const data = consentData[session.id]
            if (!data) return null
            const totalParticipants = data.participants.length

            return (
              <div
                key={session.id}
                className="bg-surface rounded-2xl border border-outline-variant overflow-hidden"
              >
                {/* Session Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
                        <Shield className="w-5 h-5 text-on-primary-container" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-on-surface truncate">{session.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {formatDate(session.session_date)} — {session.location}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="primary">{totalParticipants} peserta</Badge>
                      {data.pendingCount > 0 ? (
                        <Badge variant="warning">{data.pendingCount} pending</Badge>
                      ) : (
                        <Badge variant="success">Lengkap</Badge>
                      )}
                    </div>
                  </div>

                  {/* Consent Summary */}
                  <div className="flex items-center gap-4 mt-3 text-sm">
                    <span className="text-on-surface-variant">Rekaman:</span>
                    <span className="text-green-600 font-medium">
                      {data.consentedRecording}/{totalParticipants}
                    </span>
                    <span className="text-on-surface-variant">Foto:</span>
                    <span className="text-green-600 font-medium">
                      {data.consentedPhoto}/{totalParticipants}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Send className="w-4 h-4" />}
                        onClick={() => handleSendRequest(session.id)}
                        loading={sendingRequest[session.id]}
                      >
                        Kirim Consent Request
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={
                          expandedSession === session.id ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )
                        }
                        onClick={() => toggleSession(session.id)}
                      >
                        Detail
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Expanded Participant List */}
                {expandedSession === session.id && (
                  <div className="border-t border-outline-variant">
                    {data.participants.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-sm text-on-surface-variant">
                          Tidak ada peserta di sesi ini
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-outline-variant">
                        {/* Table header */}
                        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-surface-container-low text-xs font-medium text-on-surface-variant">
                          <span className="flex-[2]">Nama Anak</span>
                          <span className="flex-[2]">Orang Tua</span>
                          <span className="flex-1">Rekaman</span>
                          <span className="flex-1">Foto</span>
                          <span className="flex-[1.5]">Tanggal Respon</span>
                          <span className="flex-1">Aksi</span>
                        </div>

                        {data.participants.map((participant) => {
                          const recordingStatus = getConsentStatus(
                            participant.id,
                            ConsentType.RECORDING,
                            data.logs
                          )
                          const photoStatus = getConsentStatus(
                            participant.id,
                            ConsentType.PHOTO,
                            data.logs
                          )
                          const hasPending =
                            recordingStatus === 'pending' || photoStatus === 'pending'
                          const log = data.logs.find(
                            (l) => l.participant_id === participant.id
                          )

                          return (
                            <div
                              key={participant.id}
                              className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3 hover:bg-surface-container-low/50 transition-colors"
                            >
                              <div className="flex-[2] min-w-0">
                                <p className="text-sm font-medium text-on-surface truncate">
                                  {participant.child_name}
                                </p>
                                <p className="text-xs text-on-surface-variant md:hidden">
                                  {participant.parent_name} — {participant.parent_phone}
                                </p>
                              </div>
                              <div className="hidden md:block flex-[2] min-w-0">
                                <p className="text-sm text-on-surface truncate">
                                  {participant.parent_name}
                                </p>
                                <p className="text-xs text-on-surface-variant">
                                  {participant.parent_phone}
                                </p>
                              </div>
                              <div className="flex-1">
                                {recordingStatus === 'granted' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Setuju
                                  </span>
                                ) : recordingStatus === 'denied' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                                    <XCircle className="w-3.5 h-3.5" /> Tolak
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
                                    <Clock className="w-3.5 h-3.5" /> Menunggu
                                  </span>
                                )}
                              </div>
                              <div className="flex-1">
                                {photoStatus === 'granted' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Setuju
                                  </span>
                                ) : photoStatus === 'denied' ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                                    <XCircle className="w-3.5 h-3.5" /> Tolak
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
                                    <Clock className="w-3.5 h-3.5" /> Menunggu
                                  </span>
                                )}
                              </div>
                              <div className="flex-[1.5]">
                                <span className="text-xs text-on-surface-variant">
                                  {log?.responded_at
                                    ? formatDateTime(log.responded_at)
                                    : '-'}
                                </span>
                              </div>
                              <div className="flex-1">
                                {hasPending && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                                    onClick={() =>
                                      handleResendParticipant(
                                        session.id,
                                        participant.id,
                                        participant.parent_name
                                      )
                                    }
                                    loading={sendingRequest[session.id]}
                                  >
                                    Kirim Ulang
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ConsentMonitorPage
