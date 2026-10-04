import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Lock, Users } from 'lucide-react'
import { useAuth } from '../../../../core/hooks/useAuth'
import { sessionService } from '../../../../core/services/sessions'
import { participantService } from '../../../../core/services/participants'
import { ROUTES } from '../../../../core/constants/app'
import { UserRole } from '../../../../core/types/enums'
import { PageHeader } from '../../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../../shared/components/feedback/ErrorState'
import { Card } from '../../../../shared/components/ui/Card'
import { Badge } from '../../../../shared/components/ui/Badge'
import { Button } from '../../../../shared/components/ui/Button'
import { friendlyError } from '../../../../core/utils/errorMessages'
import type { Participant, SessionGroup } from '../../../../core/types'

interface GroupRouteState {
 sessionId?: string
 sessionName?: string
}

/**
 * Daftar peserta satu kelompok (GET /api/participants?group_id=).
 *
 * Ownership guard: the group's facilitator_id comes from the session detail
 * (sessionId from the navigation state passed by GaleriSessionPage, falling
 * back to the participants' own session_id). A FASILITATOR who does not own
 * the group — or who cannot verify ownership at all — gets a locked guard view
 * instead of the participant list; non-FASILITATOR roles bypass the gate,
 * mirroring useGroupOwnership. Locked groups are never linked from the session
 * page, so this only guards direct/stale URLs.
 */
const GaleriGroupPage = () => {
 const { t } = useTranslation()
 const { groupId } = useParams<{ groupId: string }>()
 const location = useLocation()
 const navigate = useNavigate()
 const { user } = useAuth()
 const routeState = (location.state ?? {}) as GroupRouteState

 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [missing, setMissing] = useState<'session' | 'group' | null>(null)
 const [participants, setParticipants] = useState<Participant[]>([])
 const [group, setGroup] = useState<SessionGroup | null>(null)
 const [sessionName, setSessionName] = useState(routeState.sessionName ?? '')

 const bypass = !user || user.role !== UserRole.FASILITATOR

 const fetchData = useCallback(async (silent = false) => {
  if (!groupId) {
   setLoading(false)
   setMissing('group')
   return
  }
  try {
   if (!silent) setLoading(true)
   setError(null)
   setMissing(null)
   const res = await participantService.getAll({
    limit: 100,
    filters: { group_id: groupId },
   })
   setParticipants(res.data)

   const sessionId = routeState.sessionId ?? res.data[0]?.session_id ?? null
   if (!sessionId) {
    // Ownership cannot be verified without the session — fail closed.
    setGroup(null)
    setSessionName('')
    return
   }
   const detail = await sessionService.getById(sessionId)
   if (!detail) {
    setGroup(null)
    setMissing('session')
    return
   }
   const found = detail.groups.find((g) => g.id === groupId)
   if (!found) {
    setGroup(null)
    setMissing('group')
    return
   }
   setGroup(found)
   setSessionName(detail.name)
  } catch (err) {
   setError(friendlyError(err))
  } finally {
   if (!silent) setLoading(false)
  }
 }, [groupId, routeState.sessionId])

 useEffect(() => {
  fetchData()
 }, [fetchData])

 // Refetch on focus/visibility so a session or group that ended/was removed
 // while the page sat in the background converges to the 404/lock state
 // (mirrors CameraPage). Silent: no skeleton flash.
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

 const header = (
  <PageHeader
   title={group?.name ?? t('fasilitator.group.pageTitle')}
   subtitle={t('fasilitator.galeri.participantsSubtitle')}
   breadcrumbs={[
    { label: t('fasilitator.galeri.pageTitle'), href: ROUTES.FASILITATOR.GALERI },
    ...(sessionName ? [{ label: sessionName }] : []),
   ]}
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

 // ── Session 404 while looking up ownership ──
 if (missing === 'session') {
  return (
   <div className="space-y-6">
    {header}
    <ErrorState
     title={t('fasilitator.groups.sessionNotFoundTitle')}
     message={t('fasilitator.groups.sessionNotFoundDesc')}
     onRetry={() => fetchData()}
    />
   </div>
  )
 }

 // ── Group gone from the session (deleted / stale URL) ──
 if (missing === 'group') {
  return (
   <div className="space-y-6">
    {header}
    <ErrorState
     title={t('fasilitator.group.notFound')}
     message={t('fasilitator.galeri.groupGoneDesc')}
     action={{
      label: t('common.back'),
      onClick: () => navigate(ROUTES.FASILITATOR.GALERI),
     }}
    />
   </div>
  )
 }

 // ── Ownership guard: locked view, participants stay hidden ──
 if (!bypass && (!group || group.facilitator_id !== user?.id)) {
  return (
   <div className="space-y-6">
    {header}
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
     <Lock className="w-12 h-12 text-on-surface-variant/40 mb-4" />
     <h3 className="text-lg font-semibold text-on-surface mb-1">
      {t('fasilitator.notMyGroup')}
     </h3>
     <p className="text-sm text-on-surface-variant max-w-sm mb-4">
      {t('fasilitator.galeri.lockedGroupDesc')}
     </p>
     <Button variant="secondary" onClick={() => navigate(ROUTES.FASILITATOR.GALERI)}>
      {t('common.back')}
     </Button>
    </div>
   </div>
  )
 }

 return (
  <div className="space-y-6">
   {header}

   {participants.length === 0 ? (
    <EmptyState
     icon={<Users className="w-12 h-12" />}
     title={t('fasilitator.group.emptyTitle')}
     description={t('fasilitator.group.emptyDesc')}
    />
   ) : (
    <Card padding="sm">
     <div className="space-y-2">
      {participants.map((p) => (
       // Row stays navigable (galeri viewing tetap bisa dibuka); the reason
       // capture is unavailable downstream is surfaced here like CameraPage's
       // consent rows — native title + badge + Lock instead of ChevronRight.
       <button
        key={p.id}
        onClick={() => navigate(ROUTES.FASILITATOR.GALERI_CHILD(p.id))}
        title={
         !p.consent_photo ? t('fasilitator.photos.consentRequired') : undefined
        }
        className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
       >
        <div className="flex items-center gap-3 min-w-0">
         <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-on-primary-container" />
         </div>
         <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface truncate">{p.child_name}</p>
          <p className="text-xs text-on-surface-variant">
           {p.school_name} &middot; {p.child_age} {t('fasilitator.camera.yearsShort')}
          </p>
         </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
         {!p.consent_photo && (
          <Badge variant="warning" size="sm">{t('fasilitator.camera.noConsentBadge')}</Badge>
         )}
         {!p.consent_photo ? (
          <Lock className="w-4 h-4 text-on-surface-variant" />
         ) : (
          <ChevronRight className="w-4 h-4 text-on-surface-variant" />
         )}
        </div>
       </button>
      ))}
     </div>
    </Card>
   )}
  </div>
 )
}

export default GaleriGroupPage
