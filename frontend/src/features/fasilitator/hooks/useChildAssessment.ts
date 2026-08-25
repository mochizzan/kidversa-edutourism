import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { substagesOfStage } from '../../../core/utils/substage'
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
  // program_substage_id -> ProgramSubstage.name (the Kegiatan title).
  programSubstageNameMap: Record<string, string>
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

    // Resolve Kegiatan leaves for the current session stage via the new
    // endpoint (no token mint needed).
    let sessionSubstages: SessionSubstage[] = []
    if (currentStage) {
      try {
        const all = await sessionService.getSubstages(session.id)
        sessionSubstages = substagesOfStage(all, currentStage.id)
      } catch {
        sessionSubstages = []
      }
    }

    const programStages = await programService.getStages(detail.program_id)
    const programStage = currentStage
      ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
      : undefined

    // Map each Kegiatan leaf to its ProgramSubstage title for display.
    const programSubstageNameMap: Record<string, string> = {}
    const substageIds = Array.from(
      new Set(sessionSubstages.map((s) => s.program_substage_id)),
    )
    if (substageIds.length > 0) {
      try {
        const substagePromises = programStages.map((ps) =>
          programSubstageService.listByStage(ps.id),
        )
        const allSubs = (await Promise.all(substagePromises)).flat()
        for (const sub of allSubs) {
          programSubstageNameMap[sub.id] = sub.name
        }
      } catch {
        // Leave the map empty; the page falls back to the Kegiatan index.
      }
    }

    return {
      detail: {
        participant,
        group,
        programStage,
        sessionStage: currentStage,
        sessionSubstages,
        programSubstageNameMap,
      },
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
        const existing = assessments.find((a) => a.session_substage_id === picked.id)
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
    const targetId = selectedSubstageId
    const leaf = childDetail.sessionSubstages.find((s) => s.id === selectedSubstageId)
    const sessionId = leaf?.session_id
    if (!targetId || !sessionId) {
      addToast({
        type: 'error',
        message: 'SubTopik ini belum memiliki Kegiatan. Minta admin atau koordinator membuat Kegiatan terlebih dahulu agar anak dapat dinilai.',
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
        session_substage_id: targetId,
        star_rating: starRating,
        comment: comment.trim() || undefined,
      }
      const result = await assessmentService.upsert(data)
      setExistingAssessment(result)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
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
        const existing = assessments.find((a) => a.session_substage_id === substageId)
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
