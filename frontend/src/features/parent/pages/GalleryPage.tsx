import { useState } from 'react'
import { Camera, Award, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GalleryTokenGuard, useGalleryToken } from '../components/GalleryTokenGuard'
import type { GalleryPhoto } from '../../../core/types'

/* ── Inner gallery component ── */
function GalleryView() {
  const { t } = useTranslation()
  const { gallery, loading } = useGalleryToken()
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null)

  if (loading || !gallery) return null

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-on-primary px-4 py-6">
        <div className="max-w-lg mx-auto text-center">
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold">{t('parent.gallery.title')}</h1>
          <p className="text-sm opacity-90 mt-1">
            {gallery.child_name}
            {gallery.group_name && <span className="opacity-75"> · {gallery.group_name}</span>}
          </p>
        </div>
      </div>

      {/* Photo grid */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {gallery.photos.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">{t('parent.gallery.empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setSelectedPhoto(photo)}
                className="relative aspect-[3/4] rounded-xl overflow-hidden bg-surface-variant group"
              >
                <img
                  src={photo.framed_file_url || photo.original_file_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {photo.is_report_photo && (
                  <div className="absolute top-1.5 left-1.5 bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <Award className="w-3 h-3" /> {t('parent.gallery.reportPhoto')}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-on-surface-variant/40">
        &copy; {new Date().getFullYear()} Kidversa Edutourism
      </div>

      {/* Fullscreen overlay */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            onClick={() => setSelectedPhoto(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={selectedPhoto.original_file_url}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

/* ── Page wrapper ── */
const GalleryPage = () => {
  return (
    <GalleryTokenGuard>
      <GalleryView />
    </GalleryTokenGuard>
  )
}

export default GalleryPage
