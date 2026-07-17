import { Camera, Award, X, Trash2 } from 'lucide-react'
import { resolveStoredUpload } from '../../../core/utils/media'
import type { SmartPhoto, Participant } from '../../../core/types'

interface PhotoGridProps {
  photos: SmartPhoto[]
  participant: Participant
  onPhotoClick: (photo: SmartPhoto) => void
}

export const PhotoGallery = ({ photos, participant, onPhotoClick }: PhotoGridProps) => (
  <div className="w-full h-full overflow-y-auto bg-white rounded-3xl p-4 md:p-6">
    {photos.length === 0 ? (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
        <Camera className="w-16 h-16 opacity-30" />
        <p className="text-sm">Belum ada foto untuk {participant.child_name}</p>
      </div>
    ) : (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {photos.map((photo) => (
          <button
            key={photo.id}
            onClick={() => onPhotoClick(photo)}
            className="aspect-[3/4] overflow-hidden rounded-2xl bg-surface-container-low relative group border border-surface-container-highest shadow-sm"
          >
            <img
              src={
                resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo') ??
                (photo.framed_file_url || photo.original_file_url)
              }
              alt=""
              className="w-full h-full object-cover"
            />
            {photo.is_report_photo && (
              <div className="absolute top-2 right-2 bg-accent text-white rounded-full p-1 shadow">
                <Award className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-2xl" />
          </button>
        ))}
      </div>
    )}
  </div>
)

interface FullscreenPhotoProps {
  photo: SmartPhoto
  onClose: () => void
  onDelete: () => void
}

export const FullscreenPhoto = ({ photo, onClose, onDelete }: FullscreenPhotoProps) => (
  <div
    className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <img
      src={
        resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo') ??
        (photo.framed_file_url || photo.original_file_url)
      }
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
      Hapus Foto
    </button>
  </div>
)
