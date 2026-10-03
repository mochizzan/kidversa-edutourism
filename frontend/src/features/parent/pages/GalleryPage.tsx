import { useState } from 'react'
import { Camera, Award, Download, ImageOff, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GalleryTokenGuard, useGalleryToken } from '../components/GalleryTokenGuard'
import { galleryService } from '../../../core/services/gallery'
import type { GalleryPhoto } from '../../../core/types'

// Placeholder for a photo whose file failed to load (deleted/404). Inlined in
// Indonesian because this change intentionally leaves the locale catalogs untouched.
const PHOTO_UNAVAILABLE = 'Foto tidak tersedia'

// Download-button label of the fullscreen overlay — inlined in Indonesian for
// the same reason as PHOTO_UNAVAILABLE above.
const PHOTO_DOWNLOAD = 'Unduh foto'

// Chip pill styling — mirrors the facilitator gallery's topic chips
// (GaleriChildPage) so the switcher reads as the same control everywhere.
const chipClass = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${active
    ? 'bg-primary text-white'
    : 'bg-surface-container-highest text-on-surface-variant hover:bg-primary/10'
  }`

/** Topic bucket of a photo, tolerating a stale payload that predates per-topic rows. */
const stageOf = (photo: GalleryPhoto): string => photo.session_stage_id ?? ''

/* ── Inner gallery component ── */
function GalleryView() {
  const { t } = useTranslation()
  const { gallery, loading, token } = useGalleryToken()
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null)
  // Photos whose bytes failed to load — each one degrades independently so a
  // single missing file never blanks the rest of the grid.
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set())
  // User's chip choice (session_stage_id; '' = legacy "Foto Lama"). null = not
  // chosen yet → the default-topic rule below picks the opening chip.
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  if (loading || !gallery) return null

  // Payload guards: a stale/cached response without the new topic fields
  // degrades to the old flat grid instead of crashing the switcher.
  const topics = Array.isArray(gallery.topics) ? gallery.topics : []
  const photos = Array.isArray(gallery.photos) ? gallery.photos : []
  const hasLegacy = photos.some((p) => stageOf(p) === '')

  // Default chip: the topic of the photo backing THIS report's mini-raport
  // (server-computed report_photo marker — pick wins), so the QR scanned from
  // a topic's rapor opens on that topic. Fallback: first topic in sequence.
  // No topics at all → null → unfiltered per-session grid (legacy behavior).
  const reportPhoto = photos.find((p) => p.report_photo)
  const flaggedStage = reportPhoto ? stageOf(reportPhoto) : null
  const activeStage: string | null =
    topics.length === 0
      ? null
      : selectedTopic !== null
        ? selectedTopic
        : flaggedStage !== null &&
          (flaggedStage === ''
            ? hasLegacy
            : topics.some((tp) => tp.session_stage_id === flaggedStage))
          ? flaggedStage
          : topics[0].session_stage_id

  const visiblePhotos =
    activeStage === null ? photos : photos.filter((p) => stageOf(p) === activeStage)

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
        {/* Topic switcher — session topics in sequence + the legacy bucket
            chip, which appears ONLY when legacy ('') photos really exist. */}
        {topics.length > 0 && (
          <div
            role="group"
            aria-label={t('parent.gallery.topicsLabel')}
            className="flex gap-2 overflow-x-auto pb-3"
          >
            {topics.map((tp) => (
              <button
                key={tp.session_stage_id}
                type="button"
                aria-pressed={tp.session_stage_id === activeStage}
                onClick={() => setSelectedTopic(tp.session_stage_id)}
                className={chipClass(tp.session_stage_id === activeStage)}
              >
                {tp.name}
              </button>
            ))}
            {hasLegacy && (
              <button
                key="__legacy"
                type="button"
                aria-pressed={activeStage === ''}
                onClick={() => setSelectedTopic('')}
                className={chipClass(activeStage === '')}
              >
                {t('parent.gallery.legacyChip')}
              </button>
            )}
          </div>
        )}

        {visiblePhotos.length === 0 ? (
          <div className="text-center py-16">
            <Camera className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">
              {photos.length === 0 ? t('parent.gallery.empty') : t('parent.gallery.emptyTopic')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visiblePhotos.map((photo) => {
              const failed = failedIds.has(photo.id)
              return (
                <button
                  key={photo.id}
                  type="button"
                  disabled={failed}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative aspect-[3/4] rounded-xl overflow-hidden bg-surface-variant group"
                >
                  {failed ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
                      <ImageOff className="w-5 h-5 text-on-surface-variant" />
                      <span className="text-[10px] text-on-surface-variant">{PHOTO_UNAVAILABLE}</span>
                    </div>
                  ) : (
                    <>
                      <img
                        src={galleryService.photoUrl(
                          token,
                          photo.id,
                          'framed',
                          // Cache key: mirrors the server's path selection
                          // (framed when present, else original), so the
                          // framed/orig transition changes the URL.
                          photo.framed_file_url || photo.original_file_url,
                        )}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={() =>
                          setFailedIds((prev) => {
                            if (prev.has(photo.id)) return prev
                            const next = new Set(prev)
                            next.add(photo.id)
                            return next
                          })
                        }
                      />
                      {photo.report_photo && (
                        <div className="absolute top-1.5 left-1.5 bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Award className="w-3 h-3" /> {t('parent.gallery.reportPhoto')}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </>
                  )}
                </button>
              )
            })}
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
          {/* Download the ORIGINAL file from the server (/download →
              Content-Disposition: attachment) — not a re-save of the rendered
              <img>. Hidden when the photo failed to load: that download would
              only ever 404. */}
          {!failedIds.has(selectedPhoto.id) && (
            <a
              href={galleryService.photoDownloadUrl(token, selectedPhoto.id)}
              download
              aria-label={PHOTO_DOWNLOAD}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-4 right-14 text-white/80 hover:text-white z-10"
            >
              <Download className="w-8 h-8" />
            </a>
          )}
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            onClick={() => setSelectedPhoto(null)}
          >
            <X className="w-8 h-8" />
          </button>
          {failedIds.has(selectedPhoto.id) ? (
            <div className="flex flex-col items-center gap-3 text-white/70">
              <ImageOff className="w-10 h-10" />
              <p className="text-sm">{PHOTO_UNAVAILABLE}</p>
            </div>
          ) : (
            <img
              src={galleryService.photoUrl(token, selectedPhoto.id)}
              alt=""
              className="max-w-full max-h-full object-contain rounded-lg"
              onError={() =>
                setFailedIds((prev) => {
                  if (prev.has(selectedPhoto.id)) return prev
                  const next = new Set(prev)
                  next.add(selectedPhoto.id)
                  return next
                })
              }
              onClick={(e) => e.stopPropagation()}
            />
          )}
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
