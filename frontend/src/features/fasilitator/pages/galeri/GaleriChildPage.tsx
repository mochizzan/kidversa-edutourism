import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Lock, Plus } from 'lucide-react'
import { useAuth } from '../../../../core/hooks/useAuth'
import { sessionService } from '../../../../core/services/sessions'
import { programService } from '../../../../core/services/programs'
import { ROUTES } from '../../../../core/constants/app'
import { UserRole } from '../../../../core/types/enums'
import { useGlobalToast } from '../../../../shared/components/feedback/Toast'
import { useSmartPhotos } from '../../hooks/useSmartPhotos'
import { PhotoGallery, FullscreenPhoto } from '../../components/PhotoGallery'
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog'
import { PageHeader } from '../../../../shared/components/ui/PageHeader'
import { ErrorState } from '../../../../shared/components/feedback/ErrorState'
import { Button } from '../../../../shared/components/ui/Button'
import { friendlyError } from '../../../../core/utils/errorMessages'
import type { Participant, SessionGroup, SmartPhoto } from '../../../../core/types'

const MAX_PHOTOS = 10

/**
 * Galeri per peserta: photo grid (reuses PhotoGallery + useSmartPhotos) with
 * two actions — Tambah Foto (navigates to the existing camera capture route)
 * and Pilih sebagai foto rapor (setPick/clearPick on the existing
 * /api/photos/report-pick endpoints).
 *
 * Ownership mirrors useGroupOwnership: a FASILITATOR acts only when
 * group.facilitator_id === user.id; other roles bypass. Consent
 * (participant.consent_photo) and ownership locks disable the actions with a
 * visible explanatory reason. Missing participant (404) renders an error state
 * with retry; an empty photo grid is PhotoGallery's empty state, not an error.
 */
const GaleriChildPage = () => {
 const { t } = useTranslation()
 const { childId } = useParams<{ childId: string }>()
 const navigate = useNavigate()
 const { user } = useAuth()
 const { addToast } = useGlobalToast()

 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [notFound, setNotFound] = useState(false)
 const [participant, setParticipant] = useState<Participant | null>(null)
 const [group, setGroup] = useState<SessionGroup | undefined>(undefined)
 const [topics, setTopics] = useState<{ programStageId: string; name: string }[]>([])
 const [activeStageId, setActiveStageId] = useState<string | null>(null)
 const [photosError, setPhotosError] = useState<string | null>(null)

 const [fullscreenPhoto, setFullscreenPhoto] = useState<SmartPhoto | null>(null)
 const [confirmDeletePhoto, setConfirmDeletePhoto] = useState<SmartPhoto | null>(null)

 const { photos, loadPhotos, picks, loadPicks, setPick, clearPick, deletePhoto } =
  useSmartPhotos(childId, participant)

 const fetchData = useCallback(async (silent = false) => {
  if (!childId) {
   setLoading(false)
   setNotFound(true)
   return
  }
  try {
   if (!silent) setLoading(true)
   setError(null)
   setNotFound(false)
   const part = await sessionService.getParticipantById(childId)
   setParticipant(part)
   if (!part) {
    setNotFound(true)
    setGroup(undefined)
    return
   }
   if (!part.session_id) {
    setGroup(undefined)
    setTopics([])
    return
   }
   const [detail, stages] = await Promise.all([
    sessionService.getById(part.session_id),
    sessionService.getStages(part.session_id),
   ])
   const found = detail?.groups.find((g) => g.id === part.group_id)
   setGroup(found)
   // Default topik = current_session_stage_id grup, fallback stage pertama
   // (pola SmartPhotoPage); pilihan user (activeStageId) menang.
   setActiveStageId(
    (prev) =>
     prev ??
     stages.find((s) => s.id === found?.current_session_stage_id)?.program_stage_id ??
     stages[0]?.program_stage_id ??
     null,
   )

   // Nama topik best-effort — gagal pun galeri tetap jalan dengan fallback.
   let names = new Map<string, string>()
   if (detail) {
    try {
     const programStages = await programService.getStages(detail.program_id)
     names = new Map(programStages.map((s) => [s.id, s.name]))
    } catch {
     addToast({ type: 'warning', message: t('fasilitator.galeri.topicLoadError') })
    }
   }
   setTopics(
    stages.map((s) => ({
     programStageId: s.program_stage_id,
     name: names.get(s.program_stage_id) ?? t('fasilitator.topicFallback'),
    })),
   )
  } catch (err) {
   setError(friendlyError(err))
  } finally {
   if (!silent) setLoading(false)
  }
 }, [childId, addToast, t])

 useEffect(() => {
  fetchData()
 }, [fetchData])

 // Refetch on focus/visibility so a session that completed or ended while the
 // page sat in the background converges without a navigation (mirrors
 // CameraPage). Silent: no skeleton flash over an open dialog/photo.
 useEffect(() => {
  const refetch = () => {
   if (document.visibilityState === 'visible') void fetchData(true)
  }
  window.addEventListener('focus', refetch)
  document.addEventListener('visibilitychange', refetch)
  return () => {
   window.removeEventListener('focus', refetch)
   document.removeEventListener('visibilitychange', refetch)
  }
 }, [fetchData])

 // Muat foto + picks begitu participant siap (guard di hook menahan saat null).
 // A photo-fetch failure renders an ErrorState+retry instead of an empty grid.
 useEffect(() => {
  if (!participant) return
  setPhotosError(null)
  void loadPhotos().catch((err) => setPhotosError(friendlyError(err)))
  void loadPicks()
 }, [participant, loadPhotos, loadPicks])

 const retryLoadPhotos = () => {
  setPhotosError(null)
  void loadPhotos().catch((err) => setPhotosError(friendlyError(err)))
 }

 // Mirror useGroupOwnership: FASILITATOR hanya boleh beraksi pada kelompoknya.
 const isMine = !user || user.role !== UserRole.FASILITATOR || group?.facilitator_id === user.id
 const consentOk = !!participant?.consent_photo
 const targetGroupId = participant?.group_id ?? group?.id

 const pickDisabledReason = !isMine
  ? t('fasilitator.notMyGroup')
  : !consentOk
   ? t('fasilitator.photos.consentRequired')
   : !activeStageId
    ? t('fasilitator.galeri.noActiveTopic')
    : undefined
 const addPhotoDisabledReason = !targetGroupId
  ? t('fasilitator.group.notFound')
  : !isMine
   ? t('fasilitator.notMyGroup')
   : !consentOk
    ? t('fasilitator.photos.consentRequired')
    : undefined

 const pickPhotoId = picks.find((p) => p.program_stage_id === activeStageId)?.photo_id ?? null

 const handleTogglePick = async (photo: SmartPhoto) => {
  if (!activeStageId || pickDisabledReason) return
  if (photo.id === pickPhotoId) {
   if (await clearPick(activeStageId)) return
   addToast({ type: 'error', message: t('fasilitator.photos.clearPickError') })
  } else {
   if (await setPick(activeStageId, photo.id)) return
   addToast({ type: 'error', message: t('fasilitator.photos.pickError') })
  }
 }

 const header = (
  <PageHeader
   title={participant ? t('fasilitator.photos.galleryTitle', { name: participant.child_name }) : t('fasilitator.galeri.pageTitle')}
   subtitle={t('fasilitator.galeri.participantsSubtitle')}
   breadcrumbs={[{ label: t('fasilitator.galeri.pageTitle'), href: ROUTES.FASILITATOR.GALERI }]}
  />
 )

 // ── Loading ──
 if (loading) {
  return (
   <div className="space-y-6">
    {header}
    <div className="animate-pulse space-y-4">
     {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-surface rounded-2xl p-5 h-16" />
     ))}
    </div>
   </div>
  )
 }

 // ── Error (fetch rejected) ──
 if (error) {
  return (
   <div className="space-y-6">
    {header}
    <ErrorState message={error} onRetry={() => fetchData()} />
   </div>
  )
 }

 // ── Participant missing / 404 ──
 if (notFound || !participant) {
  return (
   <div className="space-y-6">
    {header}
    <ErrorState
     title={t('fasilitator.photos.childMissingTitle')}
     message={t('fasilitator.photos.childMissingDesc')}
     onRetry={() => fetchData()}
    />
   </div>
  )
 }

 return (
  <div className="space-y-6">
   {header}

   {(!isMine || !consentOk) && (
    <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
     <Lock className="w-4 h-4 shrink-0" />
     {!isMine ? t('fasilitator.photos.readOnlyPhoto') : t('fasilitator.photos.consentRequired')}
    </div>
   )}

   <div className="flex flex-wrap items-center gap-3">
    <Button
     icon={<Plus className="w-4 h-4" />}
     disabled={!!addPhotoDisabledReason}
     tooltip={addPhotoDisabledReason}
     onClick={() =>
      navigate(`/fasilitator/groups/${targetGroupId}/children/${childId}/photo`)
     }
    >
     {t('fasilitator.galeri.addPhoto')}
    </Button>
    <span className="text-xs text-on-surface-variant">
     {t('fasilitator.photos.photoCount', { count: photos.length, max: MAX_PHOTOS })}
    </span>
   </div>

   {pickDisabledReason && isMine && consentOk && (
    <p className="text-xs text-on-surface-variant">{pickDisabledReason}</p>
   )}

   {topics.length > 0 && (
    <div className="flex gap-2 overflow-x-auto pb-1">
     {topics.map((tp) => (
      <button
       key={tp.programStageId}
       type="button"
       onClick={() => setActiveStageId(tp.programStageId)}
       className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${tp.programStageId === activeStageId
        ? 'bg-primary text-white'
        : 'bg-surface-container-highest text-on-surface-variant hover:bg-primary/10'
        }`}
      >
       {tp.name}
      </button>
     ))}
    </div>
   )}

   <div className="h-[65vh] min-h-[420px] border border-surface-container-highest">
    {photosError ? (
     <ErrorState message={photosError} onRetry={retryLoadPhotos} />
    ) : (
     <PhotoGallery
      photos={photos}
      participant={participant}
      onPhotoClick={setFullscreenPhoto}
      activeStageId={activeStageId}
      pickPhotoId={pickPhotoId}
      onTogglePick={handleTogglePick}
      onDelete={(photo) => setConfirmDeletePhoto(photo)}
      pickDisabledReason={pickDisabledReason}
      deleteDisabledReason={isMine ? undefined : t('fasilitator.notMyGroup')}
     />
    )}
   </div>

   {fullscreenPhoto && (
    <FullscreenPhoto
     photo={fullscreenPhoto}
     onClose={() => setFullscreenPhoto(null)}
     onDelete={() => setConfirmDeletePhoto(fullscreenPhoto)}
    />
   )}

   <ConfirmDialog
    open={confirmDeletePhoto !== null}
    title={t('fasilitator.photos.deletePhoto')}
    message={t('fasilitator.photos.deleteConfirm')}
    onConfirm={async () => {
     const photo = confirmDeletePhoto
     if (!photo) return
     try {
      await Promise.all([deletePhoto(photo.id), loadPicks()])
      setFullscreenPhoto(null)
     } catch {
      addToast({ type: 'error', message: t('fasilitator.photos.deleteError') })
     } finally {
      setConfirmDeletePhoto(null)
     }
    }}
    onClose={() => setConfirmDeletePhoto(null)}
   />
  </div>
 )
}

export default GaleriChildPage
