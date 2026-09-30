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

  // Rejects on failure so callers render their own ErrorState/retry (the
  // photo grid must never present a failed fetch as an empty list).
  const loadPhotos = useCallback(async () => {
    if (!childId) return
    const updated = await photoService.getByParticipant(childId)
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
    async ({ childId: id, participant, takenBy, blob, frameId, isReportPhoto }: UploadOptions) => {
      if (!participant.session_id) {
        throw new Error('NO_SESSION')
      }
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const photo = await photoService.upload(id, participant.session_id, file)

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

      return photo
    },
    [],
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
