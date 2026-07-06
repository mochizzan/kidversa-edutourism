import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Video, FileText, CheckCircle2, SkipForward, Mic } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { recordingService } from '../../../core/services/recordings'
import { sessionService } from '../../../core/services/sessions'
import type { Recording } from '../../../core/types'
import { RecordingsReviewStatus } from '../../../core/types'
import { formatDateTime, formatFileSize } from '../../../shared/utils'
import { cn } from '../../../core/utils'

interface EmotionTag {
  label: string
  percentage: number
  color: string
  bgColor: string
}

const EMOTION_COLORS: Record<string, { label: string; color: string; bgColor: string }> = {
  antusias: { label: 'Antusias', color: 'text-green-700', bgColor: 'bg-green-100' },
  netral: { label: 'Netral', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  ragu: { label: 'Ragu', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  sedih: { label: 'Sedih', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  takut: { label: 'Takut', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  marah: { label: 'Marah', color: 'text-red-700', bgColor: 'bg-red-100' },
  senang: { label: 'Senang', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
}

function parseEmotionTags(tags: Record<string, unknown> | undefined): EmotionTag[] {
  if (!tags || typeof tags !== 'object') return []
  return Object.entries(tags)
    .map(([key, value]) => {
      const pct = typeof value === 'number' ? value : 0
      const config = EMOTION_COLORS[key] || {
        label: key,
        color: 'text-on-surface-variant',
        bgColor: 'bg-surface-variant',
      }
      return { label: config.label, percentage: pct, color: config.color, bgColor: config.bgColor }
    })
    .sort((a, b) => b.percentage - a.percentage)
}

const RecordingDetailPage = () => {
  const { recordingId } = useParams<{ recordingId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  const [recording, setRecording] = useState<Recording | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Participant info
  const [childName, setChildName] = useState('')
  const [sessionName, setSessionName] = useState('')

  // Emotion override
  const [overrideEmotion, setOverrideEmotion] = useState('')

  // Reviewer notes
  const [reviewerNotes, setReviewerNotes] = useState('')

  const loadRecording = useCallback(async () => {
    if (!recordingId) return
    setLoading(true)
    setError(null)
    try {
      const rec = await recordingService.getById(recordingId)
      if (!rec) {
        setError('Rekaman tidak ditemukan')
        return
      }
      setRecording(rec)

      // Try to get participant and session info
      try {
        // Find which session this recording belongs to via session stages
        const allSessions = await sessionService.getAll({ limit: 100 })
        for (const session of allSessions.data) {
          const recordings = await recordingService.getBySession(session.id)
          if (recordings.some((r) => r.id === recordingId)) {
            setSessionName(session.name)
            const detail = await sessionService.getById(session.id)
            const participant = detail?.groups
              .flatMap((g) => g.participants)
              .find((p) => p.id === rec.participant_id)
            if (participant) {
              setChildName(participant.child_name)
            }
            break
          }
        }
      } catch {
        // Non-critical, continue
      }
    } catch {
      setError('Gagal memuat data rekaman')
    } finally {
      setLoading(false)
    }
  }, [recordingId])

  useEffect(() => {
    loadRecording()
  }, [loadRecording])

  const handleReview = async (status: RecordingsReviewStatus) => {
    if (!recording) return
    setSaving(true)
    try {
      await recordingService.update(recording.id, {
        review_status: status,
        reviewed_by: 'admin',
        reviewed_at: new Date().toISOString(),
      })
      setRecording((prev) =>
        prev ? { ...prev, review_status: status, reviewed_by: 'admin', reviewed_at: new Date().toISOString() } : prev
      )
      addToast({
        type: 'success',
        message:
          status === RecordingsReviewStatus.REVIEWED
            ? 'Review berhasil disimpan'
            : 'Rekaman dilewati',
      })
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan review' })
    } finally {
      setSaving(false)
    }
  }

  const emotions = recording ? parseEmotionTags(recording.emotion_tags_json) : []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-sm text-on-surface-variant">Memuat rekaman...</span>
      </div>
    )
  }

  if (error || !recording) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/admin/recordings')}>
          Kembali
        </Button>
        <ErrorState message={error || 'Rekaman tidak ditemukan'} onRetry={loadRecording} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/admin/recordings')}>
        Kembali
      </Button>

      {/* Header info */}
      <div className="bg-surface rounded-2xl border border-outline-variant p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
              <Mic className="w-6 h-6 text-on-primary-container" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-on-surface">
                {childName || 'Partisipan'}
              </h1>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {sessionName || 'Sesi'} — {formatDateTime(recording.created_at)}
              </p>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant={recording.review_status === 'PENDING' ? 'neutral' : recording.review_status === 'REVIEWED' ? 'success' : 'warning'}>
                  {recording.review_status === 'PENDING' ? 'Menunggu Review' : recording.review_status === 'REVIEWED' ? 'Sudah Direview' : 'Dilewati'}
                </Badge>
                {recording.reviewed_by && (
                  <span className="text-xs text-on-surface-variant">
                    Oleh: {recording.reviewed_by}
                  </span>
                )}
                {recording.reviewed_at && (
                  <span className="text-xs text-on-surface-variant">
                    {formatDateTime(recording.reviewed_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-on-surface-variant space-y-1">
            <p>Durasi: {Math.floor(recording.duration_seconds / 60)}:{String(recording.duration_seconds % 60).padStart(2, '0')}</p>
            {recording.file_size_bytes && <p>Ukuran: {formatFileSize(recording.file_size_bytes)}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Video + Transcript */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player Placeholder */}
          <Card title="Pemutar Rekaman" padding="none">
            <div className="aspect-video bg-surface-container-high rounded-t-2xl flex items-center justify-center">
              {recording.file_url ? (
                <div className="text-center p-6">
                  <Video className="w-16 h-16 mx-auto mb-3 text-on-surface-variant/50" />
                  <p className="text-sm text-on-surface-variant mb-2">
                    File: {recording.file_url}
                  </p>
                  <p className="text-xs text-on-surface-variant/60">
                    Pemutar video akan tersedia setelah integrasi dengan layanan streaming.
                  </p>
                </div>
              ) : (
                <div className="text-center p-6">
                  <Video className="w-16 h-16 mx-auto mb-3 text-on-surface-variant/30" />
                  <p className="text-sm text-on-surface-variant">Tidak ada file rekaman</p>
                </div>
              )}
            </div>
          </Card>

          {/* Transcript */}
          <Card title="Transkrip" padding="none">
            {recording.transcript_text ? (
              <div className="p-4">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-on-surface-variant mt-0.5 shrink-0" />
                  <p className="text-sm text-on-surface leading-relaxed italic">
                    "{recording.transcript_text}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <p className="text-sm text-on-surface-variant">Tidak ada transkrip tersedia</p>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Analysis */}
        <div className="space-y-6">
          {/* Emotion Tags */}
          <Card title="Analisis Emosi AI" subtitle="Deteksi emosi otomatis dari rekaman">
            {emotions.length > 0 ? (
              <div className="space-y-3">
                {emotions.map((emotion) => (
                  <div key={emotion.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-on-surface">{emotion.label}</span>
                      <span className={cn('text-sm font-semibold', emotion.color)}>
                        {(emotion.percentage * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', emotion.bgColor)}
                        style={{ width: `${emotion.percentage * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-on-surface-variant">Tidak ada data emosi</p>
            )}
          </Card>

          {/* Override Emotion */}
          <Card title="Override Label Emosi">
            <Select
              options={[
                { value: '', label: 'Tidak ada perubahan' },
                ...Object.entries(EMOTION_COLORS).map(([key, config]) => ({
                  value: key,
                  label: config.label,
                })),
              ]}
              value={overrideEmotion}
              onChange={(e) => setOverrideEmotion(e.target.value)}
            />
            {overrideEmotion && (
              <p className="mt-2 text-xs text-on-surface-variant">
                Label emosi akan diganti menjadi{' '}
                <span className="font-medium text-on-surface">
                  {EMOTION_COLORS[overrideEmotion]?.label || overrideEmotion}
                </span>
              </p>
            )}
          </Card>

          {/* Reviewer Notes */}
          <Card title="Catatan Reviewer">
            <textarea
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              rows={4}
              placeholder="Tulis catatan review di sini..."
              className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none resize-none"
            />
          </Card>

          {/* Actions */}
          <div className="bg-surface rounded-2xl border border-outline-variant p-4 space-y-3">
            <p className="text-sm font-medium text-on-surface">Aksi Review</p>
            <Button
              className="w-full"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => handleReview(RecordingsReviewStatus.REVIEWED)}
              loading={saving}
              disabled={recording.review_status === RecordingsReviewStatus.REVIEWED}
            >
              Selesai Review
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              icon={<SkipForward className="w-4 h-4" />}
              onClick={() => handleReview(RecordingsReviewStatus.SKIPPED)}
              loading={saving}
              disabled={recording.review_status === RecordingsReviewStatus.SKIPPED}
            >
              Skip Review
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RecordingDetailPage
