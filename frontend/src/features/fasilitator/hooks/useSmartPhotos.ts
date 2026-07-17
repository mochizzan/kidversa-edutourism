import { useState, useCallback } from 'react'
import { photoService } from '../../../core/services/photos'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { SmartPhoto, Participant } from '../../../core/types'

interface UploadOptions {
  childId: string
  participant: Participant
  takenBy: string
  blob: Blob
  frameId: string | null
  isReportPhoto: boolean
}

export function useSmartPhotos(childId: string | undefined) {
  const { addToast } = useGlobalToast()
  const [photos, setPhotos] = useState<SmartPhoto[]>([])

  const loadPhotos = useCallback(async () => {
    if (!childId) return
    try {
      const updated = await photoService.getByParticipant(childId)
      setPhotos(updated)
    } catch {
      addToast({ type: 'error', message: 'Gagal memuat ulang foto.' })
    }
  }, [childId, addToast])

  const setPhotosDirect = useCallback((next: SmartPhoto[]) => {
    setPhotos(next)
  }, [])

  const deletePhoto = useCallback(
    async (photoId: string) => {
      await photoService.delete(photoId)
      await loadPhotos()
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
        if (isReportPhoto && participant.consent_photo) updateData.is_report_photo = true
        updateData.taken_by = takenBy

        await photoService.update(photo.id, updateData)

        if (isReportPhoto && participant.consent_photo) {
          const allPhotos = await photoService.getByParticipant(id)
          for (const p of allPhotos) {
            if (p.id !== photo.id && p.is_report_photo) {
              await photoService.update(p.id, { is_report_photo: false })
            }
          }
        }
      }

      return photo
    },
    [],
  )

  return { photos, loadPhotos, setPhotos: setPhotosDirect, deletePhoto, uploadPhoto }
}
