import { Camera, FileText, Plus, X, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMediaUrl } from '../../../core/utils/media'
import type { SmartPhoto, Participant } from '../../../core/types'

/**
 * "Tambah Foto" tile rendered inside the grid with EXACTLY the photo tile
 * size (`aspect-[3/4] rounded-2xl`). `ariaLabel` is a distinct accessible
 * name from the page header's Tambah Foto button; `disabled` + a visible
 * `disabledReason` mirror the header button's lock semantics.
 */
export interface GalleryAddCard {
 label: string
 ariaLabel: string
 onClick: () => void
 disabled?: boolean
 disabledReason?: string
}

interface PhotoGridProps {
 photos: SmartPhoto[]
 participant: Participant
 /**
  * Photo click handler. Outside select mode the page opens the fullscreen
  * viewer; in select mode it toggles the pending mini-rapor selection
  * (at most one photo). The grid never picks directly — selection state and
  * saving live in the page header's toggle.
  */
 onPhotoClick: (photo: SmartPhoto) => void
 /** Saved mini-rapor pick — drives the badge/highlight outside select mode. */
 pickPhotoId: string | null
 /** When true, photo clicks toggle the pending selection instead of opening fullscreen. */
 selectMode: boolean
 /** Pending (not yet saved) selection while in select mode — at most one photo. */
 pendingPhotoId: string | null
 onDelete: (photo: SmartPhoto) => void
 /** When set, the delete buttons are disabled and this becomes their visible title/aria reason. */
 deleteDisabledReason?: string
 /**
 * First-cell add tile — rendered only while the active topic is below the
 * 10-photo cap (undefined hides it entirely).
 */
 addCard?: GalleryAddCard
}

export const PhotoGallery = ({
 photos,
 participant,
 onPhotoClick,
 pickPhotoId,
 selectMode,
 pendingPhotoId,
 onDelete,
 deleteDisabledReason,
 addCard,
}: PhotoGridProps) => {
 const { t } = useTranslation()
 // Same tile geometry as a photo tile so the grid never reflows when the
 // add card appears/disappears (aspect-[3/4] rounded-2xl + shared surface).
 const addTile = addCard ? (
  <button
   key="__add-photo"
   type="button"
   onClick={addCard.onClick}
   disabled={addCard.disabled}
   title={addCard.disabledReason}
   aria-label={addCard.ariaLabel}
   className="relative flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-container-highest bg-surface-container-low text-on-surface-variant shadow-sm transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
  >
   <Plus className="w-6 h-6" />
   <span className="px-2 text-center text-xs font-medium">{addCard.label}</span>
  </button>
 ) : null
 return (
  <div className="w-full h-full overflow-y-auto bg-white rounded-3xl p-4 md:p-6">
   {photos.length === 0 ? (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-on-surface-variant">
     <Camera className="w-16 h-16 opacity-30" />
     <p className="text-sm">{t('fasilitator.photos.emptyFor', { name: participant.child_name })}</p>
     {addTile}
    </div>
   ) : (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
     {addTile}
     {photos.map((photo) => {
      // Select mode: badge/highlight tracks the pending selection;
      // otherwise the saved mini-rapor pick.
      const selected = selectMode
       ? pendingPhotoId === photo.id
       : pickPhotoId === photo.id
      return (
       <div
        key={photo.id}
        role="button"
        tabIndex={0}
        aria-pressed={selectMode ? pendingPhotoId === photo.id : undefined}
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
        {photo.is_report_photo && (
         <span
          aria-label={t('fasilitator.photos.reportBadge')}
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white shadow"
         >
          <FileText className="h-3 w-3" aria-hidden="true" />
          {t('fasilitator.photos.reportBadge')}
         </span>
        )}
        {selected && (
         <span
          aria-label={t('fasilitator.photos.miniRaportBadge')}
          className="absolute top-2 right-2 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white shadow"
         >
          {t('fasilitator.photos.miniRaportBadge')}
         </span>
        )}
        <div className="absolute bottom-2 right-2 z-10">
         <button
          type="button"
          disabled={!!deleteDisabledReason}
          title={deleteDisabledReason ?? t('fasilitator.photos.deletePhoto')}
          aria-label={deleteDisabledReason ?? t('fasilitator.photos.deletePhoto')}
          onClick={(e) => {
           e.stopPropagation()
           onDelete(photo)
          }}
          className="rounded-full bg-black/50 p-1.5 text-white shadow-md hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
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
