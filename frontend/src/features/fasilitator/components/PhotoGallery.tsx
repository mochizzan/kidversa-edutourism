import { Camera, Award, Check, X, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMediaUrl } from '../../../core/utils/media'
import type { SmartPhoto, Participant } from '../../../core/types'

interface PhotoGridProps {
  photos: SmartPhoto[]
  participant: Participant
  onPhotoClick: (photo: SmartPhoto) => void
  activeStageId: string | null
  pickPhotoId: string | null
  onTogglePick: (photo: SmartPhoto) => void
  onDelete: (photo: SmartPhoto) => void
}

export const PhotoGallery = ({
  photos,
  participant,
  onPhotoClick,
  activeStageId,
  pickPhotoId,
  onTogglePick,
  onDelete,
}: PhotoGridProps) => {
  const { t } = useTranslation()
  const canPick = !!participant?.consent_photo && !!activeStageId
  return (
    <div className="w-full h-full overflow-y-auto bg-white rounded-3xl p-4 md:p-6">
      {photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
          <Camera className="w-16 h-16 opacity-30" />
          <p className="text-sm">{t('fasilitator.photos.emptyFor', { name: participant.child_name })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {photos.map((photo) => {
            const selected = pickPhotoId === photo.id
            return (
              <div
                key={photo.id}
                role="button"
                tabIndex={0}
                onClick={() => onPhotoClick(photo)}
                onKeyDown={(e) =>
                  (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPhotoClick(photo))
                }
                className={`group relative block aspect-[3/4] cursor-pointer overflow-hidden rounded-2xl bg-surface-container-low shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected
                    ? 'border-2 border-primary ring-2 ring-primary/40'
                    : 'border border-surface-container-highest'
                  }`}
              >
                <img
                  src={getMediaUrl('photo', photo.id)}
                  alt=""
                  className="w-full h-full object-cover"
                />
                {photo.is_report_photo && !selected && (
                  <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-1 shadow">
                    <Award className="w-3.5 h-3.5" />
                  </div>
                )}
                {selected && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-primary p-1 text-white shadow">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                <div className="absolute bottom-2 left-2 z-10 flex gap-1.5">
                  <button
                    type="button"
                    disabled={!canPick}
                    title={
                      selected ? t('fasilitator.photos.unpickPhoto') : t('fasilitator.photos.pickPhoto')
                    }
                    aria-label={
                      selected ? t('fasilitator.photos.unpickPhoto') : t('fasilitator.photos.pickPhoto')
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePick(photo)
                    }}
                    className={`rounded-full p-1.5 shadow-md transition ${selected ? 'bg-primary text-white' : 'bg-black/50 text-white hover:bg-black/70'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {selected ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    title={t('fasilitator.photos.deletePhoto')}
                    aria-label={t('fasilitator.photos.deletePhoto')}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(photo)
                    }}
                    className="rounded-full bg-black/50 p-1.5 text-white shadow-md hover:bg-black/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-2xl" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface FullscreenPhotoProps {
  photo: SmartPhoto
  onClose: () => void
  onDelete: () => void
}

export const FullscreenPhoto = ({ photo, onClose, onDelete }: FullscreenPhotoProps) => {
  const { t } = useTranslation()
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={getMediaUrl('photo', photo.id)}
        alt=""
        className="max-w-full max-h-[85vh] object-contain rounded-lg"
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-all"
      >
        <X className="w-6 h-6" />
      </button>
      <button
        onClick={onDelete}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-error text-white px-5 py-2.5 rounded-full text-sm font-bold shadow-md hover:bg-error-dark transition-all"
      >
        <Trash2 className="w-4 h-4" />
        {t('fasilitator.photos.deletePhoto')}
      </button>
    </div>
  )
}
