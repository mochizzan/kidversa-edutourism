import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, ChevronRight, Loader2, AlertCircle, FileText, Eye } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { recordingService } from '../../../core/services/recordings'
import { sessionService } from '../../../core/services/sessions'
import type { Session, Recording } from '../../../core/types'
import { formatDate, formatDateTime } from '../../../shared/utils'

interface SessionWithRecordings extends Session {
  recordings: Recording[]
  recordingCount: number
}

const RecordingReviewPage = () => {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<SessionWithRecordings[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [sessionRecordings, setSessionRecordings] = useState<Record<string, Recording[]>>({})
  const [loadingRecordings, setLoadingRecordings] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sessionsRes = await sessionService.getAll({ limit: 100 })
      const sessionsWithRecordings: SessionWithRecordings[] = []

      for (const session of sessionsRes.data) {
        const recordings = await recordingService.getBySession(session.id)
        if (recordings.length > 0) {
          sessionsWithRecordings.push({
            ...session,
            recordings,
            recordingCount: recordings.length,
          })
        }
      }

      setSessions(sessionsWithRecordings)
    } catch {
      setError('Gagal memuat data rekaman')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleSession = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null)
      return
    }

    setExpandedSession(sessionId)

    if (!sessionRecordings[sessionId]) {
      setLoadingRecordings((prev) => ({ ...prev, [sessionId]: true }))
      try {
        const recordings = await recordingService.getBySession(sessionId)
        // Enrich with participant data
        const enriched = await Promise.all(
          recordings.map(async (rec) => {
            try {
              const sessionDetail = await sessionService.getById(sessionId)
              const participant = sessionDetail?.groups
                .flatMap((g) => g.participants)
                .find((p) => p.id === rec.participant_id)
              return { ...rec, child_name: participant?.child_name || 'Unknown' }
            } catch {
              return { ...rec, child_name: 'Unknown' }
            }
          })
        )
        setSessionRecordings((prev) => ({ ...prev, [sessionId]: enriched }))
      } catch {
        setSessionRecordings((prev) => ({ ...prev, [sessionId]: [] }))
      } finally {
        setLoadingRecordings((prev) => ({ ...prev, [sessionId]: false }))
      }
    }
  }

  const statusVariant: Record<string, 'neutral' | 'primary' | 'success' | 'danger' | 'warning'> = {
    PENDING: 'neutral',
    REVIEWED: 'success',
    SKIPPED: 'warning',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review Rekaman"
        subtitle="Tinjau dan kelola rekaman suara anak dari sesi edutourism."
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">Memuat data rekaman...</span>
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
          icon={<Mic className="w-12 h-12" />}
          title="Belum ada rekaman"
          description="Belum ada rekaman suara yang tersedia untuk direview. Rekaman akan muncul setelah fasilitator mengunggahnya dari sesi."
        />
      )}

      {/* Session List */}
      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="bg-surface rounded-2xl border border-outline-variant overflow-hidden"
            >
              {/* Session header */}
              <button
                onClick={() => toggleSession(session.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-container-low/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
                    <Mic className="w-5 h-5 text-on-primary-container" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface truncate">{session.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {formatDate(session.session_date)} — {session.location}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="primary">{session.recordingCount} rekaman</Badge>
                  <ChevronRight
                    className={`w-5 h-5 text-on-surface-variant transition-transform ${
                      expandedSession === session.id ? 'rotate-90' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Expanded recordings */}
              {expandedSession === session.id && (
                <div className="border-t border-outline-variant">
                  {loadingRecordings[session.id] ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      <span className="ml-2 text-sm text-on-surface-variant">
                        Memuat rekaman...
                      </span>
                    </div>
                  ) : sessionRecordings[session.id]?.length === 0 ? (
                    <div className="py-6 text-center">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-on-surface-variant/50" />
                      <p className="text-sm text-on-surface-variant">
                        Tidak ada rekaman untuk sesi ini
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-outline-variant">
                      {sessionRecordings[session.id]?.map((rec: Recording & { child_name?: string }) => (
                        <div
                          key={rec.id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-surface-container-low/50 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">
                              {rec.child_name || 'Partisipan'}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-on-surface-variant">
                                {rec.duration_seconds
                                  ? `${Math.floor(rec.duration_seconds / 60)}:${String(
                                      rec.duration_seconds % 60
                                    ).padStart(2, '0')}`
                                  : '-'}
                              </span>
                              <Badge
                                variant={
                                  statusVariant[rec.review_status] || 'neutral'
                                }
                                size="sm"
                              >
                                {rec.review_status === 'PENDING'
                                  ? 'Menunggu'
                                  : rec.review_status === 'REVIEWED'
                                    ? 'Selesai'
                                    : 'Dilewati'}
                              </Badge>
                              {rec.created_at && (
                                <span className="text-xs text-on-surface-variant">
                                  {formatDateTime(rec.created_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Eye className="w-4 h-4" />}
                            onClick={() => navigate(`/admin/recordings/${rec.id}`)}
                          >
                            Review
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecordingReviewPage
