import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Images, Lock, Plus, Save, X } from 'lucide-react'
import { useAuth } from '../../../../core/hooks/useAuth'
import { sessionService } from '../../../../core/services/sessions'
import { programService } from '../../../../core/services/programs'
import { photoService } from '../../../../core/services/photos'
import { ROUTES } from '../../../../core/constants/app'
import { UserRole } from '../../../../core/types/enums'
import { useGlobalToast } from '../../../../shared/components/feedback/Toast'
import { useSmartPhotos } from '../../hooks/useSmartPhotos'
import { PhotoGallery, FullscreenPhoto } from '../../components/PhotoGallery'
import { ConfirmDialog } from '../../../../shared/components/feedback/ConfirmDialog'
import { PageHeader } from '../../../../shared/components/ui/PageHeader'
import { ErrorState } from '../../../../shared/components/feedback/ErrorState'
import { Button } from '../../../../shared/components/ui/Button'
import { Select } from '../../../../shared/components/ui/Select'
import { friendlyError } from '../../../../core/utils/errorMessages'
import type { Participant, SessionGroup, SmartPhoto } from '../../../../core/types'

const MAX_PHOTOS = 10

export type GallerySortKey = 'newest' | 'oldest' | 'largest' | 'smallest'

/**
 * Client-side gallery ordering (K). newest = time DESC (default), oldest =
 * time ASC; largest/smallest = file_size DESC/ASC with null file_size rows
 * last in BOTH directions. Size ties keep time-DESC order (pre-sort by time
 * DESC, then a stable size sort). Never mutates the input array. Time =
 * created_at with taken_at fallback.
 */
export function sortPhotosForGallery(
 photos: SmartPhoto[],
 key: GallerySortKey,
): SmartPhoto[] {
 const time = (photo: SmartPhoto) => Date.parse(photo.created_at ?? photo.taken_at) || 0
 const byTimeDesc = (a: SmartPhoto, b: SmartPhoto) => time(b) - time(a)

 if (key === 'newest') return [...photos].sort(byTimeDesc)
 if (key === 'oldest') return [...photos].sort((a, b) => -byTimeDesc(a, b))

 const direction = key === 'smallest' ? -1 : 1
 return [...photos]
  .sort(byTimeDesc)
  .sort((a, b) => {
   const sizeA = a.file_size
   const sizeB = b.file_size
   const missingA = sizeA === null || sizeA === undefined
   const missingB = sizeB === null || sizeB === undefined
   if (missingA || missingB) {
    if (missingA && missingB) return 0
    return missingA ? 1 : -1 // null/undefined always last
   }
   return direction * (sizeB - sizeA)
  })
}

/**
 * Galeri per peserta: photo grid (reuses PhotoGallery + useSmartPhotos) with
 * two header actions — Tambah Foto (navigates to the existing camera capture
 * route) and a two-state mini-rapor toggle. The toggle switches between
 * "Pilih Foto Mini Rapor" (select mode: clicking a photo marks at most one
 * pending selection instead of opening fullscreen) and "Simpan Pilihan"
 * (saves the pending selection via setPick on the existing
 * /api/photos/report-pick endpoints); "Batal" exits select mode and discards
 * the pending selection without touching the server.
 *
 * Ownership mirrors useGroupOwnership: a FASILITATOR acts only when
 * group.facilitator_id === user.id; other roles bypass. Consent
 * (participant.consent_photo) and ownership locks disable entering select
 * mode with a visible explanatory reason. Missing participant (404) renders an
 * error state with retry; an empty photo grid is PhotoGallery's empty state,
 * not an error.
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
 // Chips keyed on the SESSION stage id (the photo bucket / ?stage= value the
 // camera consumes); programStageId is kept only for the mini-rapor picks.
 const [topics, setTopics] = useState<
  { sessionStageId: string; programStageId: string; name: string }[]
 >([])
 // Session stage id of the ACTIVE chip. '' = legacy "Foto Lama" bucket,
 // null = no topic resolved yet (or a session without stages).
 const [activeStageId, setActiveStageId] = useState<string | null>(null)
 // Stages resolved → the photo fetch may key on activeStageId. Gates the
 // first fetch so an all-photos request can never race (and clobber) the
 // per-topic one before the default chip is known.
 const [stageReady, setStageReady] = useState(false)
 // Legacy '' bucket probe result — the extra chip is shown ONLY when that
 // bucket really has rows.
 const [hasLegacyPhotos, setHasLegacyPhotos] = useState(false)
 const [photosError, setPhotosError] = useState<string | null>(null)
 const [sortKey, setSortKey] = useState<GallerySortKey>('newest')

 const [fullscreenPhoto, setFullscreenPhoto] = useState<SmartPhoto | null>(null)
 const [confirmDeletePhoto, setConfirmDeletePhoto] = useState<SmartPhoto | null>(null)

 // Mode pilih mini rapor (toggle dua state di header). pendingPhotoId hanya
 // hidup selama select mode — belum tersimpan sampai Simpan Pilihan sukses.
 const [selectMode, setSelectMode] = useState(false)
 const [pendingPhotoId, setPendingPhotoId] = useState<string | null>(null)

 // Satu save in-flight pada satu waktu: menutup double-POST (klik Simpan ganda
 // atau Enter berulang) dan membekukan Batal supaya mode tidak keluar di
 // tengah permintaan (state basah: hasil save telat datang setelah mode ganti).
 const [saving, setSaving] = useState(false)
 const savingRef = useRef(false)
 // Unmount di tengah save (navigasi) → transisi state dilewati; toast global
 // tetap menampilkan kegagalan sehingga tidak pernah senyap.
 const mountedRef = useRef(true)
 useEffect(() => {
  mountedRef.current = true
  return () => {
   mountedRef.current = false
  }
 }, [])

 const { photos, loadPhotos, setPhotos, picks, loadPicks, setPick, deletePhoto } =
  useSmartPhotos(childId, participant)

 // Urutan galeri (K) — client-side; `photos` IS the active topic's bucket
 // (GET /api/photos?participant_id=&session_stage_id=), jadi sort/counter/grid
 // selalu membaca topik yang sedang aktif.
 const sortedPhotos = useMemo(() => sortPhotosForGallery(photos, sortKey), [photos, sortKey])

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
    // Sesi tanpa stages: tak ada topik untuk difilter — photo effect boleh
    // jalan dengan activeStageId null (semua foto, perilaku lama).
    setStageReady(true)
    return
   }
   const [detail, stages] = await Promise.all([
    sessionService.getById(part.session_id),
    sessionService.getStages(part.session_id),
   ])
   const found = detail?.groups.find((g) => g.id === part.group_id)
   setGroup(found)
   // Default topik = current_session_stage_id grup, fallback stage pertama
   // (pola SmartPhotoPage); pilihan user (activeStageId) menang. NOTE: nilai
   // adalah SESSION stage id (bucket foto / ?stage=), bukan program stage.
   setActiveStageId(
    (prev) =>
     prev ??
     stages.find((s) => s.id === found?.current_session_stage_id)?.id ??
     stages[0]?.id ??
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
     sessionStageId: s.id,
     programStageId: s.program_stage_id,
     name: names.get(s.program_stage_id) ?? t('fasilitator.topicFallback'),
    })),
   )
   // Chips + default topik siap → photo effect berikut mengunci bucket-nya.
   setStageReady(true)
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

 // Legacy "Foto Lama" bucket probe — sekali per participant. Chip-nya hanya
 // muncul bila bucket '' benar-benar berisi (session_stage_id= tanpa nilai =
 // sinyal bucket legacy pada kontrak backend). Best-effort: probe gagal →
 // chip disembunyikan, galeri tetap jalan.
 useEffect(() => {
  if (!childId || !participant) return
  let cancelled = false
  photoService
   .getByParticipant(childId, { sessionStageId: '' })
   .then((rows) => {
    if (!cancelled) setHasLegacyPhotos(rows.length > 0)
   })
   .catch(() => {
    if (!cancelled) setHasLegacyPhotos(false)
   })
  return () => {
   cancelled = true
  }
 }, [childId, participant])

 // Muat foto PER TOPIK: satu request session_stage_id= untuk chip yang aktif
 // (maksimal 10 foto per bucket — tak pernah kena limit 100). stageReady
 // menahan fetch pertama sampai default chip diketahui supaya request
 // all-photos (activeStageId null) tak pernah balapan dengan request topik.
 // Ganti chip → effect ini jalan lagi → counter/grid di-reset ke bucket baru.
 // Kegagalan fetch dirender ErrorState+retry, bukan grid kosong.
 useEffect(() => {
  if (!participant || !stageReady) return
  setPhotosError(null)
  void loadPhotos(activeStageId ?? undefined).catch((err) =>
   setPhotosError(friendlyError(err)),
  )
 }, [participant, stageReady, activeStageId, loadPhotos])

 // Picks per participant+session (bukan per topik) — cukup sekali per load.
 useEffect(() => {
  if (!participant) return
  void loadPicks()
 }, [participant, loadPicks])

 const retryLoadPhotos = () => {
  setPhotosError(null)
  // Argumen topik eksplisit → retry selalu mengambil bucket yang sedang aktif
  // (bisa saja retry ditekan sebelum fetch pertama sempat mengisi topicRef).
  void loadPhotos(activeStageId ?? undefined).catch((err) =>
   setPhotosError(friendlyError(err)),
  )
 }

 // Mirror useGroupOwnership: FASILITATOR hanya boleh beraksi pada kelompoknya.
 const isMine = !user || user.role !== UserRole.FASILITATOR || group?.facilitator_id === user.id
 const consentOk = !!participant?.consent_photo
 const targetGroupId = participant?.group_id ?? group?.id

 // Topik aktif dalam dua bentuk: sessionStageId (bucket foto / ?stage=) dan
 // programStageId (kontrak report-picks). Legacy bucket ('') tak punya
 // keduanya → pick mini rapor mustahil di sana.
 const isLegacyActive = activeStageId === ''
 const activeProgramStageId =
  topics.find((tp) => tp.sessionStageId === activeStageId)?.programStageId ?? null

 const pickDisabledReason = !isMine
  ? t('fasilitator.notMyGroup')
  : !consentOk
   ? t('fasilitator.photos.consentRequired')
   : isLegacyActive
    ? t('fasilitator.galeri.legacyPickReason')
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

 // "Tambah Foto" hanya di topik nyata dan selama di bawah batas 10 foto;
 // bucket legacy disembunyikan (tak ada program stage untuk di-upload).
 const showAddCard = activeStageId !== null && !isLegacyActive && photos.length < MAX_PHOTOS

 // Rute kamera + topik AKTIF (?stage=) — SmartPhotoPage mengunggah ke session
 // stage itu. Bucket legacy / belum ada topik → tanpa query → kamera fallback
 // ke current/first stage grup (tak pernah memalsukan topik untuk foto lama).
 const cameraTarget =
  `/fasilitator/groups/${targetGroupId}/children/${childId}/photo` +
  (activeStageId ? `?stage=${encodeURIComponent(activeStageId)}` : '')

 const pickPhotoId =
  picks.find((p) => p.program_stage_id === activeProgramStageId)?.photo_id ?? null

 // ── Toggle mini rapor (dua state) ──
 // Masuk mode pilih: hanya saat tak ada kendala; daftar foto kosong → toast
 // (bukan diam, bukan crash). Keluar lewat Simpan Pilihan (sukses) atau Batal.
 const enterSelectMode = () => {
  if (pickDisabledReason) return
  if (photos.length === 0) {
   addToast({ type: 'warning', message: t('fasilitator.galeri.selectModeNoPhotos') })
   return
  }
  setPendingPhotoId(null)
  setSelectMode(true)
 }

 // Pilihan tertunda yang menunjuk foto terhapus (dihapus di grid/tab lain atau
 // hilang saat refetch fokus) dibersihkan begitu daftar foto berubah — Simpan
 // tidak pernah mengirim photo_id yang sudah tidak ada.
 useEffect(() => {
  if (!selectMode || !pendingPhotoId) return
  if (!photos.some((p) => p.id === pendingPhotoId)) setPendingPhotoId(null)
 }, [photos, selectMode, pendingPhotoId])

 // Simpan pilihan tertunda. Tanpa pilihan → toast tanpa memanggil API; foto
 // hilang → bersihkan pilihan + toast (tanpa POST id mati); gagal → log sebab
 // + toast error dan mode pilih + pilihan tetap; sukses → keluar mode. Satu
 // permintaan dalam penerbangan: klik kedua diabaikan (tanpa double POST).
 const saveSelection = async () => {
  if (savingRef.current) return
  if (!pendingPhotoId) {
   addToast({ type: 'warning', message: t('fasilitator.galeri.selectModeNothingSelected') })
   return
  }
  if (!photos.some((p) => p.id === pendingPhotoId)) {
   setPendingPhotoId(null)
   addToast({ type: 'warning', message: t('fasilitator.galeri.selectModeNothingSelected') })
   return
  }
  // Pick dikirim dengan PROGRAM stage id (kontrak report-picks), bukan
  // session stage id yang dipakai chip/foto.
  if (!activeProgramStageId) {
   console.warn('[GaleriChildPage] saveSelection skipped: no active topic', { pendingPhotoId })
   addToast({ type: 'error', message: t('fasilitator.galeri.noActiveTopic') })
   return
  }
  savingRef.current = true
  setSaving(true)
  try {
   const saved = await setPick(activeProgramStageId, pendingPhotoId)
   if (!saved) {
    addToast({ type: 'error', message: t('fasilitator.photos.pickError') })
    return
   }
   if (mountedRef.current) {
    setSelectMode(false)
    setPendingPhotoId(null)
   }
  } catch (err) {
   // setPick menangkap kegagalan jaringannya sendiri (→ false); penjaga ini
   // menutup jalur yang tetap melempar tanpa menelan sebabnya.
   console.error('[GaleriChildPage] saveSelection failed', err)
   addToast({ type: 'error', message: t('fasilitator.photos.pickError') })
  } finally {
   savingRef.current = false
   if (mountedRef.current) setSaving(false)
  }
 }

 const handleToggleSelectMode = () => {
  if (selectMode) void saveSelection()
  else enterSelectMode()
 }

 // Batal dibekukan selama save in-flight (tombol juga disabled): mode tidak
 // boleh keluar di tengah permintaan — hasil save yang datang telat tidak boleh
 // mengubah state yang sudah user reset.
 const cancelSelectMode = () => {
  if (savingRef.current) return
  setSelectMode(false)
  setPendingPhotoId(null)
 }

 // Klik tile: mode pilih → tandai/buang pilihan tertunda (maksimal 1, tanpa
 // fullscreen); di luar mode pilih → buka fullscreen seperti biasa.
 const handleGridPhotoClick = (photo: SmartPhoto) => {
  if (!selectMode) {
   setFullscreenPhoto(photo)
   return
  }
  setPendingPhotoId((prev) => (prev === photo.id ? null : photo.id))
 }

 // Ganti chip topik: reset counter/grid SEGERA (photos state selalu milik
 // topik aktif) sambil effect fetch memuat bucket chip yang dipilih. Mode
 // pilih tetap hidup — pilihan tertunda otomatis dibersihkan karena foto
 // lama tak ada lagi di daftar.
 const handleTopicSelect = (sessionStageId: string) => {
  setActiveStageId(sessionStageId)
  setPhotos([])
  setPhotosError(null)
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
     onClick={() => navigate(cameraTarget)}
    >
     {t('fasilitator.galeri.addPhoto')}
    </Button>
    <Button
     icon={selectMode ? <Save className="w-4 h-4" /> : <Images className="w-4 h-4" />}
     disabled={saving || (!selectMode && !!pickDisabledReason)}
     tooltip={pickDisabledReason}
     onClick={handleToggleSelectMode}
    >
     {selectMode
      ? t('fasilitator.galeri.selectModeSave')
      : t('fasilitator.galeri.selectModeStart')}
    </Button>
    {selectMode && (
     <Button
      variant="ghost"
      icon={<X className="w-4 h-4" />}
      disabled={saving}
      onClick={cancelSelectMode}
     >
      {t('common.cancel')}
     </Button>
    )}
    <span className="text-xs text-on-surface-variant">
     {t('fasilitator.photos.photoCount', { count: photos.length, max: MAX_PHOTOS })}
    </span>
    <Select
     className="w-44"
     aria-label={t('fasilitator.galeri.sortLabel')}
     value={sortKey}
     onChange={(e) => setSortKey(e.target.value as GallerySortKey)}
     options={[
      { value: 'newest', label: t('fasilitator.galeri.sortNewest') },
      { value: 'oldest', label: t('fasilitator.galeri.sortOldest') },
      { value: 'largest', label: t('fasilitator.galeri.sortLargest') },
      { value: 'smallest', label: t('fasilitator.galeri.sortSmallest') },
     ]}
    />
   </div>

   {selectMode ? (
    <p className="text-xs text-on-surface-variant">{t('fasilitator.galeri.selectModeHint')}</p>
   ) : (
    pickDisabledReason &&
    isMine &&
    consentOk && <p className="text-xs text-on-surface-variant">{pickDisabledReason}</p>
   )}

   {topics.length > 0 && (
    <div className="flex gap-2 overflow-x-auto pb-1">
     {topics.map((tp) => (
      <button
       key={tp.sessionStageId}
       type="button"
       onClick={() => handleTopicSelect(tp.sessionStageId)}
       className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${tp.sessionStageId === activeStageId
        ? 'bg-primary text-white'
        : 'bg-surface-container-highest text-on-surface-variant hover:bg-primary/10'
        }`}
      >
       {tp.name}
      </button>
     ))}
     {hasLegacyPhotos && (
      <button
       key="__legacy"
       type="button"
       onClick={() => handleTopicSelect('')}
       className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${isLegacyActive
        ? 'bg-primary text-white'
        : 'bg-surface-container-highest text-on-surface-variant hover:bg-primary/10'
        }`}
      >
       {t('fasilitator.galeri.legacyChip')}
      </button>
     )}
    </div>
   )}

   <div className="h-[65vh] min-h-[420px] border border-surface-container-highest">
    {photosError ? (
     <ErrorState message={photosError} onRetry={retryLoadPhotos} />
    ) : (
     <PhotoGallery
      photos={sortedPhotos}
      participant={participant}
      onPhotoClick={handleGridPhotoClick}
      pickPhotoId={pickPhotoId}
      selectMode={selectMode}
      pendingPhotoId={pendingPhotoId}
      onDelete={(photo) => setConfirmDeletePhoto(photo)}
      deleteDisabledReason={isMine ? undefined : t('fasilitator.notMyGroup')}
      addCard={
       showAddCard
        ? {
         label: t('fasilitator.galeri.addPhoto'),
         ariaLabel: t('fasilitator.galeri.addCardLabel'),
         onClick: () => navigate(cameraTarget),
         disabled: !!addPhotoDisabledReason,
         disabledReason: addPhotoDisabledReason,
        }
        : undefined
      }
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
      // Foto yang dihapus adalah pilihan tertunda → pilihannya tidak berlaku
      // lagi; jangan biarkan Simpan mengirim photo_id yang sudah mati.
      if (pendingPhotoId === photo.id) setPendingPhotoId(null)
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
