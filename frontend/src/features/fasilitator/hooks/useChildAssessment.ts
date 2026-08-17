import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useGroupOwnership } from './useGroupOwnership'
import type {
  Participant,
  SessionGroup,
  Assessment,
  SessionStage,
  ProgramStage,
  CreateAssessmentDTO,
} from '../../../core/types'

export interface ChildDetail {
  participant: Participant
  group: SessionGroup | undefined
  programStage?: ProgramStage
  sessionStage: SessionStage | undefined
}

async function findChildInSessions(childId: string): Promise<ChildDetail | null> {
  const res = await sessionService.getAll({ limit: 100 })
  for (const session of res.data) {
    const detail = await sessionService.getById(session.id)
    if (!detail) continue

    const participant = detail.groups
      .flatMap((g) => g.participants)
      .find((p) => p.id === childId)
    if (!participant) continue

    const group = detail.groups.find((g) => g.participants.some((p) => p.id === childId))
    if (!group) continue

    let currentStage = detail.stages.find((s) => s.id === group.current_session_stage_id)

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

    if (!currentStage && detail.stages.length > 0) {
      currentStage =
        detail.stages.find((s) => s.status === 'ACTIVE') ?? detail.stages[0]
    }

    const programStages = await programService.getStages(detail.program_id)
    const programStage = currentStage
      ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
      : undefined

    return { participant, group, programStage, sessionStage: currentStage }
  }
  return null
}

export function useChildAssessment(childId: string | undefined) {
  const { user } = useAuth()
  const { addToast } = useGlobalToast()
  const { isMine } = useGroupOwnership(childId)

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

      if (detail.sessionStage) {
        const assessments = await assessmentService.getByParticipant(childId)
        const existing = assessments.find((a) => a.session_stage_id === detail.sessionStage!.id)
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

  const handleSave = useCallback(async () => {
    if (!childDetail?.sessionStage) {
      addToast({
        type: 'error',
        message:
          'Kelompok belum memiliki stage aktif. Buka kelompok dari dashboard fasilitator, lalu mulai sesi agar stage terkunci dan dapat dinilai.',
      })
      return
    }
    if (!childId || !user) {
      addToast({ type: 'error', message: 'Sesi tidak valid, silakan login ulang' })
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
  }, [childDetail, childId, user, starRating, comment, addToast])

  const isDirty =
    starRating !== (existingAssessment?.star_rating ?? 0) ||
    comment !== (existingAssessment?.comment ?? '')

  return {
    loading,
    error,
    childDetail,
    starRating,
    setStarRating,
    comment,
    setComment,
    saving,
    saveSuccess,
    isDirty,
    isMine,
    fetchData,
    handleSave,
  }
}
