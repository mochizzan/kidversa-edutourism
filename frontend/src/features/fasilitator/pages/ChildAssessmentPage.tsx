import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Star, Camera, Video, Save, ShieldCheck, ShieldX } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { ROUTES } from '../../../core/constants/app'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { cn } from '../../../core/utils'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { Participant, Assessment, SessionStage, ProgramStage, CreateAssessmentDTO } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

interface ChildDetail {
  participant: Participant
  programStage?: ProgramStage
  sessionStage: SessionStage | undefined
}

async function findChildInSessions(
  childId: string,
): Promise<ChildDetail | null> {
  const res = await sessionService.getAll({ limit: 100 })
  for (const session of res.data) {
    const detail = await sessionService.getById(session.id)
    if (!detail) continue

    const participant = detail.groups
      .flatMap((g) => g.participants)
      .find((p) => p.id === childId)
    if (!participant) continue

    // Find the group and its current stage
    const group = detail.groups.find((g) =>
      g.participants.some((p) => p.id === childId),
    )
    if (!group) continue

    let currentStage = detail.stages.find(
      (s) => s.id === group.current_stage_id,
    )

    if (!currentStage && detail.stages.length > 0) {
      const allProgress = await liveService.getProgress(detail.id)
      const groupProg = allProgress
        .filter((p) => p.group_id === group.id)
        .filter((p) => p.status === 'COMPLETED' || p.status === 'IN_PROGRESS')
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? b.entered_at ?? '').getTime() -
            new Date(a.completed_at ?? a.entered_at ?? '').getTime(),
        )
      if (groupProg.length > 0) {
        currentStage = detail.stages.find((s) => s.id === groupProg[0].session_stage_id)
      }
    }

    // Get program stage details
    const programStages = await programService.getStages(detail.program_id)
    const programStage = currentStage
      ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
      : undefined

    return {
      participant,
      programStage,
      sessionStage: currentStage,
    }
  }
  return null
}

function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            'p-1 rounded-lg transition-all duration-150',
            'hover:scale-110 active:scale-95',
            disabled && 'cursor-not-allowed opacity-60',
          )}
          aria-label={`Nilai ${star} bintang`}
        >
          <Star
            className={cn(
              'w-8 h-8 sm:w-10 sm:h-10 transition-colors',
              star <= value
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-outline-variant',
            )}
          />
        </button>
      ))}
      <span className="ml-3 text-sm font-medium text-on-surface-variant">
        {value > 0 ? `${value}/5` : 'Belum dinilai'}
      </span>
    </div>
  )
}

const ChildAssessmentPage = () => {
  const { groupId, childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useGlobalToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null)
  const [existingAssessment, setExistingAssessment] = useState<Assessment | null>(null)

  const [starRating, setStarRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    if (!childId) return
    try {
      setLoading(true)
      setError(null)

      const detail = await findChildInSessions(childId)
      if (!detail) {
        setError('Data anak tidak ditemukan')
        return
      }
      setChildDetail(detail)

      // Fetch existing assessment for this participant
      if (detail.sessionStage) {
        const assessments = await assessmentService.getByParticipant(childId)
        const existing = assessments.find(
          (a) => a.session_stage_id === detail.sessionStage!.id,
        )
        if (existing) {
          setExistingAssessment(existing)
          setStarRating(existing.star_rating)
          setComment(existing.comment ?? '')
        }
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [childId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSave = async () => {
    if (!childDetail?.sessionStage) {
      addToast({
        type: 'error',
        message: 'Kelompok belum memiliki stage aktif. Buka kelompok dari dashboard fasilitator, lalu mulai sesi agar stage terkunci dan dapat dinilai.',
      })
      return
    }
    if (!childId || !user) {
      addToast({
        type: 'error',
        message: 'Sesi tidak valid, silakan login ulang',
      })
      return
    }
    if (starRating === 0) return

    setSaving(true)
    try {
      const data: CreateAssessmentDTO = {
        participant_id: childId,
        session_id: childDetail.sessionStage.session_id,
        session_stage_id: childDetail.sessionStage.id,
        star_rating: starRating,
        comment: comment.trim() || undefined,
      }
      const result = await assessmentService.upsert(data)
      setExistingAssessment(result)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan penilaian' })
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    navigate(`/fasilitator/groups/${groupId}`)
  }

  const { participant, programStage } = childDetail ?? {}
  const hasConsentPhoto = participant?.consent_photo ?? false
  const hasConsentRecording = participant?.consent_recording ?? false
  const isDirty = starRating !== (existingAssessment?.star_rating ?? 0) ||
    comment !== (existingAssessment?.comment ?? '')

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-container-high rounded w-48 animate-pulse mb-4" />
        <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-surface-container-high animate-pulse" />
            <div className="flex-1">
              <div className="h-5 bg-surface-container-high rounded w-1/3 mb-2 animate-pulse" />
              <div className="h-4 bg-surface-container-high rounded w-1/4 animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-16 bg-surface-container-high rounded animate-pulse" />
            <div className="h-24 bg-surface-container-high rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error && !childDetail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Penilaian Anak" />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty / not found state ──
  if (!childDetail || !participant) {
    return (
      <div className="space-y-6">
        <PageHeader title="Penilaian Anak" />
        <ErrorState message="Data anak tidak ditemukan" onRetry={fetchData} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penilaian Anak"
        breadcrumbs={[
          { label: 'Dashboard', href: ROUTES.FASILITATOR.DASHBOARD },
          { label: participant.child_name },
        ]}
      />

      {/* Child Info Card */}
      <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xl shrink-0">
            {participant.child_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              {participant.child_name}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {participant.child_age} tahun
              {participant.school_name ? ` - ${participant.school_name}` : ''}
            </p>
          </div>
        </div>

        {/* Consent status */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          {programStage?.is_photo_stage && (
            <div className="flex items-center gap-1.5 text-xs">
              {hasConsentPhoto ? (
                <span className="flex items-center gap-1 text-green-600">
                  <ShieldCheck className="w-3.5 h-3.5" /> Izin Foto
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <ShieldX className="w-3.5 h-3.5" /> Tidak Ada Izin Foto
                </span>
              )}
            </div>
          )}
          {programStage?.is_recording_stage && (
            <div className="flex items-center gap-1.5 text-xs">
              {hasConsentRecording ? (
                <span className="flex items-center gap-1 text-green-600">
                  <ShieldCheck className="w-3.5 h-3.5" /> Izin Rekaman
                </span>
              ) : (
                <span className="flex items-center gap-1 text-yellow-600">
                  <ShieldX className="w-3.5 h-3.5" /> Tidak Ada Izin Rekaman
                </span>
              )}
            </div>
          )}
        </div>

        {/* Assessment form */}
        <div className="space-y-6">
          {/* Star Rating */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">
              Penilaian Bintang
            </label>
            <StarRatingInput
              value={starRating}
              onChange={setStarRating}
              disabled={saving}
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-on-surface mb-2">
              Komentar
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tulis komentar tentang anak ini..."
              maxLength={300}
              rows={4}
              disabled={saving}
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface placeholder-on-surface-variant focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none transition-all"
            />
            <p className="text-xs text-on-surface-variant mt-1 text-right">
              {comment.length}/300
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              loading={saving}
              disabled={starRating === 0 || !isDirty || saving}
              icon={<Save className="w-4 h-4" />}
            >
              Simpan Penilaian
            </Button>
            {saveSuccess && (
              <span className="text-sm text-green-600 font-medium animate-fade-in">
                Tersimpan!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {(programStage?.is_photo_stage || programStage?.is_recording_stage) && (
        <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
          <h3 className="text-sm font-semibold text-on-surface mb-4">Aksi Cepat</h3>
          <div className="flex flex-wrap gap-3">
            {/* Photo action */}
            {programStage.is_photo_stage && (
              <div className="flex-1 min-w-[180px]">
                {hasConsentPhoto ? (
                  <button
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-container text-on-primary-container font-medium text-sm hover:bg-primary-container/80 transition-colors"
                    onClick={() =>
                      navigate(`/fasilitator/groups/${groupId}/children/${childId}/photo`)
                    }
                  >
                    <Camera className="w-5 h-5" />
                    Ambil Foto
                  </button>
                ) : (
                  <div className="w-full px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-center gap-2">
                    <ShieldX className="w-4 h-4 shrink-0" />
                    <span>Tidak ada izin foto</span>
                  </div>
                )}
              </div>
            )}

            {/* Recording action */}
            {programStage.is_recording_stage && (
              <div className="flex-1 min-w-[180px]">
                {hasConsentRecording ? (
                  <button
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-container text-on-primary-container font-medium text-sm hover:bg-primary-container/80 transition-colors"
                    onClick={() =>
                      navigate(`/fasilitator/groups/${groupId}/children/${childId}/record`)
                    }
                  >
                    <Video className="w-5 h-5" />
                    Rekam Video
                  </button>
                ) : (
                  <div className="w-full px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-center gap-2">
                    <ShieldX className="w-4 h-4 shrink-0" />
                    <span>Tidak ada izin rekaman</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Back button */}
      <div className="flex sm:justify-start">
        <Button variant="secondary" onClick={handleBack} className="w-full sm:w-auto">
          Kembali ke Kelompok
        </Button>
      </div>
    </div>
  )
}

export default ChildAssessmentPage
