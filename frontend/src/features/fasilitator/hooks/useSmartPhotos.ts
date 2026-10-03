import { useState, useCallback, useRef } from 'react'
import { i18n } from '../../../core/i18n'
import { photoService } from '../../../core/services/photos'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { ReportPhotoPick, SmartPhoto, Participant } from '../../../core/types'

const logError = (scope: string, error: unknown) => {
  console.error(`[${scope}]`, error)
}

interface UploadOptions {
  childId: string
  participant: Participant
  /** Target topic bucket — REQUIRED by the upload endpoint (session_stages.id). */
  sessionStageId: string
  takenBy: string
  blob: Blob
  frameId: string | null
  isReportPhoto: boolean
}

export function useSmartPhotos(
  childId: string | undefined,
  participant: Participant | null = null,
) {
  const { addToast } = useGlobalToast()
  const [photos, setPhotos] = useState<SmartPhoto[]>([])
  const [picks, setPicks] = useState<ReportPhotoPick[]>([])

  // Ref-stable snapshot (same idiom as SmartPhotoPage's useStableRef): keeps
  // loadPicks/setPick/clearPick identity-stable so page effects don't refire
  // when the participant resolves asynchronously.
  const participantRef = useRef(participant)
  participantRef.current = participant
  const getParticipant = useCallback(() => participantRef.current, [])

  // Topic of the LAST photo fetch ('' = legacy bucket, null/undefined = no
  // topic filter). deletePhoto/uploadPhoto refresh with no argument so the
  // grid always re-fetches the SAME bucket the user is looking at instead of
  // silently reverting to all photos.
  const photoTopicRef = useRef<string | null | undefined>(undefined)

  // Rejects on failure so callers render their own ErrorState/retry (the
  // photo grid must never present a failed fetch as an empty list).
  // sessionStageId: undefined → argument omitted → keep the current bucket
  // (first call: ALL photos); a string narrows to that one topic — '' being
  // the legacy no-topic bucket (present-but-empty query param).
  const loadPhotos = useCallback(async (sessionStageId?: string | null) => {
    if (!childId) return
    if (sessionStageId !== undefined) photoTopicRef.current = sessionStageId
    const topic = sessionStageId !== undefined ? sessionStageId : photoTopicRef.current
    // "All photos" = options argument OMITTED entirely (the contract's
    // absent-param semantics); a string narrows to that one bucket — '' being
    // the legacy no-topic bucket (present-but-empty query param).
    const updated =
      topic === undefined || topic === null
        ? await photoService.getByParticipant(childId)
        : await photoService.getByParticipant(childId, { sessionStageId: topic })
    setPhotos(updated)
  }, [childId])

  const setPhotosDirect = useCallback((next: SmartPhoto[]) => {
    setPhotos(next)
  }, [])

  const loadPicks = useCallback(async () => {
    const participant = getParticipant()
    if (!participant?.session_id) return
    try {
      const data = await photoService.getReportPicks(participant.id, participant.session_id)
      setPicks(data)
    } catch (error) {
      logError('useSmartPhotos.loadPicks', error)
      addToast({ type: 'error', message: i18n.t('fasilitator.galeri.picksLoadError') })
    }
  }, [getParticipant, addToast])

  const setPick = useCallback(
    async (programStageId: string, photoId: string): Promise<boolean> => {
      const participant = getParticipant()
      if (!participant?.session_id) return false
      try {
        await photoService.setReportPick({
          participant_id: participant.id,
          session_id: participant.session_id,
          program_stage_id: programStageId,
          photo_id: photoId,
        })
        // Server sudah konfirmasi 200 (R4): perbarui local state — replace per topik.
        setPicks((prev) => [
          ...prev.filter((p) => p.program_stage_id !== programStageId),
          { program_stage_id: programStageId, photo_id: photoId },
        ])
        return true
      } catch (error) {
        logError('useSmartPhotos.setPick', error)
        return false
      }
    },
    [getParticipant],
  )

  const clearPick = useCallback(async (programStageId: string): Promise<boolean> => {
    const participant = getParticipant()
    if (!participant?.session_id) return false
    try {
      await photoService.clearReportPick({
        participant_id: participant.id,
        session_id: participant.session_id,
        program_stage_id: programStageId,
      })
      setPicks((prev) => prev.filter((p) => p.program_stage_id !== programStageId))
      return true
    } catch (error) {
      logError('useSmartPhotos.clearPick', error)
      return false
    }
  }, [getParticipant])

  const deletePhoto = useCallback(
    async (photoId: string) => {
      await photoService.delete(photoId)
      try {
        await loadPhotos()
      } catch (error) {
        // The delete itself succeeded — log the stale-grid refresh failure
        // instead of surfacing a misleading "delete failed" toast; the page's
        // focus refetch converges the grid.
        logError('useSmartPhotos.deletePhoto refresh', error)
      }
    },
    [loadPhotos],
  )

  const uploadPhoto = useCallback(
    async (
      { childId: id, participant, sessionStageId, takenBy, blob, frameId, isReportPhoto }: UploadOptions,
      opts?: { onProgress?: (percent: number) => void },
    ) => {
      if (!participant.session_id) {
        throw new Error('NO_SESSION')
      }
      // Upload the canvas blob as-is (PNG full size, tanpa kompresi/re-encode);
      // only the container name/MIME follow the blob's type — .jpg for
      // image/jpeg, .png for image/png and everything else.
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const file = new File([blob], `photo-${Date.now()}.${ext}`, {
        type: blob.type || 'image/png',
      })
      const photo = await photoService.upload(
        id,
        participant.session_id,
        sessionStageId,
        file,
        opts,
      )

      if (frameId || isReportPhoto) {
        const updateData: Partial<SmartPhoto> = {}
        if (frameId) updateData.frame_id = frameId
        updateData.taken_by = takenBy
        if (Object.keys(updateData).length > 0) await photoService.update(photo.id, updateData)
        if (isReportPhoto && participant.consent_photo) {
          // Eksklusif di server (SetReportPhoto clear+set) — menggantikan flag + loop manual.
          await photoService.setReportPhoto(photo.id)
        }
      }

      // Refresh from the server so the gallery counter reflects the new photo.
      // Every step above surfaces its own failure: any error (upload, follow-up
      // update, report flag, refresh) propagates — uploadPhoto only resolves
      // once the server confirmed all of them (status akhir dari server).
      await loadPhotos()

      return photo
    },
    [loadPhotos],
  )

  return {
    photos,
    loadPhotos,
    setPhotos: setPhotosDirect,
    picks,
    loadPicks,
    setPick,
    clearPick,
    deletePhoto,
    uploadPhoto,
  }
}
