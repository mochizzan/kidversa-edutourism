import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { apiRequest } from '../../../core/services/backendClient'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useGroupOwnership } from './useGroupOwnership'
import type {
  Participant,
  SessionGroup,
  Assessment,
  SessionStage,
  ProgramStage,
  SessionSubstage,
  CreateAssessmentDTO,
} from '../../../core/types'

export interface ChildDetail {
  participant: Participant
  group: SessionGroup | undefined
  programStage?: ProgramStage
  sessionStage: SessionStage | undefined
  // Kegiatan (session_substage) leaves for the current session stage. The
  // assessment is scored per leaf, not per session stage.
  sessionSubstages: SessionSubstage[]
}

async function findChildInSessions(childId: string): Promise<{ detail: ChildDetail | null; sessionId?: string }> {
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
      currentStage =
        detail.stages.find((s) => s.status === 'ACTIVE') ?? detail.stages[0]
    }

    // Resolve Kegiatan leaves for the current session stage via the kiosk
    // detail (the only read that exposes session_substages). Mint a token like
    // the live monitor does, then read the per-stage session_substages.
    let sessionSubstages: SessionSubstage[] = []
    if (currentStage) {
      try {
        const tokenRes = await apiRequest<{ data: { token: string } }>(
          'POST',
          API_ROUTES.AUTH.KIOSK,
          { session_id: session.id },
        )
        const kiosk = await apiRequest<{
          data: { stages: { stage: { id: string }; substages: { substage: SessionSubstage }[] }[] }
        }>('GET', `${API_ROUTES.SESSIONS.KIOSK_ACCESS(session.id)}?token=${encodeURIComponent(tokenRes.data.token)}`)
        const flat: SessionSubstage[] = []
        for (const st of kiosk.data.stages) {
          if (st.stage.id !== currentStage.id) continue
          for (const sub of st.substages) flat.push(sub.substage)
        }
        sessionSubstages = flat
      } catch {
        sessionSubstages = []
      }
    }

    const programStages = await programService.getStages(detail.program_id)
    const programStage = currentStage
      ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
      : undefined

    return {
      detail: { participant, group, programStage, sessionStage: currentStage, sessionSubstages },
      sessionId: session.id,
    }
  }
  return { detail: null }
}

export function useChildAssessment(childId: string | undefined) {
  const { user } = useAuth()
  const { addToast } = useGlobalToast()
  const { isMine } = useGroupOwnership(childId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [childDetail, setChildDetail] = useState<ChildDetail | null>(null)
  const [existingAssessment, setExistingAssessment] = useState<Assessment | null>(null)

  const [starRating, setStarRating] = useState(1)
  const [comment, setComment] = useState('')
  const [selectedSubstageId, setSelectedSubstageId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchData = useCallback(async () => {
    if (!childId) return
    try {
      setLoading(true)
      setError(null)

      const { detail } = await findChildInSessions(childId)
      if (!detail) {
        setError('Data anak tidak ditemukan')
        return
      }
      setChildDetail(detail)

      const leaves = detail.sessionSubstages
      if (leaves.length > 0) {
        // Prefer the first incomplete leaf; otherwise the first leaf.
        const incomplete = leaves.find((s) => s.status !== 'COMPLETED')
        const picked = incomplete ?? leaves[0]
        setSelectedSubstageId(picked.id)

        const assessments = await assessmentService.getByParticipant(childId)
        const existing = assessments.find((a) => a.session_stage_id === picked.id)
        if (existing) {
          setExistingAssessment(existing)
          setStarRating(existing.star_rating)
          setComment(existing.comment ?? '')
        } else {
          setStarRating(1)
          setComment('')
        }
      } else if (detail.sessionStage) {
        // Fallback: no leaves resolved (e.g. legacy session) — score the stage.
        const assessments = await assessmentService.getByParticipant(childId)
        const existing = assessments.find((a) => a.session_stage_id === detail.sessionStage!.id)
        if (existing) {
          setExistingAssessment(existing)
          setStarRating(existing.star_rating)
          setComment(existing.comment ?? '')
        } else {
          setStarRating(1)
          setComment('')
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
    if (!childDetail) {
      addToast({ type: 'error', message: 'Data anak tidak ditemukan' })
      return
    }
    // The assessment target is the selected Kegiatan leaf (session_substage).
    // Fall back to the session stage only when no leaves were resolved.
    const targetId = selectedSubstageId ?? childDetail.sessionStage?.id
    const sessionId =
      selectedSubstageId
        ? childDetail.sessionSubstages.find((s) => s.id === selectedSubstageId)?.session_id
        : childDetail.sessionStage?.session_id
    if (!targetId || !sessionId) {
      addToast({
        type: 'error',
        message:
          'Kelompok belum memiliki stage aktif. Buka kelompok dari dashboard fasilitator, lalu mulai sesi agar anak dapat dinilai.',
      })
      return
    }
    if (!childId || !user) {
      addToast({ type: 'error', message: 'Sesi tidak valid, silakan login ulang' })
      return
    }
    // 0 means "tidak hadir" and is a valid, persistable rating.

    setSaving(true)
    try {
      const data: CreateAssessmentDTO = {
        participant_id: childId,
        session_id: sessionId,
        session_stage_id: targetId,
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
  }, [childDetail, selectedSubstageId, childId, user, starRating, comment, addToast])

  // When the facilitator switches the Kegiatan leaf, load its existing score.
  const selectSubstage = useCallback(
    async (substageId: string) => {
      setSelectedSubstageId(substageId)
      if (!childId) return
      try {
        const assessments = await assessmentService.getByParticipant(childId)
        const existing = assessments.find((a) => a.session_stage_id === substageId)
        if (existing) {
          setExistingAssessment(existing)
          setStarRating(existing.star_rating)
          setComment(existing.comment ?? '')
        } else {
          setStarRating(1)
          setComment('')
        }
      } catch {
        setStarRating(1)
        setComment('')
      }
    },
    [childId],
  )

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
    selectedSubstageId,
    selectSubstage,
    saving,
    saveSuccess,
    isDirty,
    isMine,
    fetchData,
    handleSave,
  }
}
