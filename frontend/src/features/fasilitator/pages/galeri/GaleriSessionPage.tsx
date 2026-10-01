import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Lock, Users } from 'lucide-react'
import { useAuth } from '../../../../core/hooks/useAuth'
import { sessionService } from '../../../../core/services/sessions'
import { ROUTES } from '../../../../core/constants/app'
import { UserRole } from '../../../../core/types/enums'
import { PageHeader } from '../../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../../shared/components/feedback/ErrorState'
import { Card } from '../../../../shared/components/ui/Card'
import { Badge } from '../../../../shared/components/ui/Badge'
import { Modal } from '../../../../shared/components/ui/Modal'
import { friendlyError } from '../../../../core/utils/errorMessages'
import type { Session, SessionGroup } from '../../../../core/types'

/**
 * Daftar kelompok tersedia untuk satu sesi (GET /api/sessions/:id/groups).
 *
 * A FASILITATOR only enters groups they own (group.facilitator_id === user.id);
 * non-owned groups stay visible but locked — same rule as the session list,
 * mirroring useGroupOwnership. Non-FASILITATOR roles bypass the gate.
 * A missing session (404 → getById returns null) renders an error state with
 * retry, never a blank page.
 */
const GaleriSessionPage = () => {
 const { t } = useTranslation()
 const { sessionId } = useParams<{ sessionId: string }>()
 const navigate = useNavigate()
 const { user } = useAuth()

 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [notFound, setNotFound] = useState(false)
 const [session, setSession] = useState<Session | null>(null)
 const [groups, setGroups] = useState<SessionGroup[]>([])
 const [showLockedInfo, setShowLockedInfo] = useState(false)

 const bypass = !user || user.role !== UserRole.FASILITATOR

 const fetchData = useCallback(async (silent = false) => {
  if (!sessionId) {
   setLoading(false)
   setNotFound(true)
   return
  }
  try {
   if (!silent) setLoading(true)
   setError(null)
   setNotFound(false)
   const [detail, groupList] = await Promise.all([
    sessionService.getById(sessionId),
    sessionService.getGroups(sessionId),
   ])
   if (!detail) {
    setSession(null)
    setGroups([])
    setNotFound(true)
    return
   }
   setSession(detail)
   setGroups(groupList)
  } catch (err) {
   setError(friendlyError(err))
  } finally {
   if (!silent) setLoading(false)
  }
 }, [sessionId])

 useEffect(() => {
  fetchData()
 }, [fetchData])

 // Refetch on focus/visibility so a session that ended or was removed while
 // the page sat in the background converges to the 404/error state (mirrors
 // CameraPage). Silent: no skeleton flash.
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
   title={session?.name ?? t('fasilitator.galeri.pageTitle')}
   subtitle={t('fasilitator.galeri.groupsSubtitle')}
   breadcrumbs={[
    { label: t('fasilitator.galeri.pageTitle'), href: ROUTES.FASILITATOR.GALERI },
    ...(session ? [{ label: session.name }] : []),
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
      <div key={i} className="bg-surface rounded-2xl p-5 h-20" />
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

 // ── Session missing / 404 ──
 if (notFound || !session) {
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

 return (
  <div className="space-y-6">
   {header}

   {groups.length === 0 ? (
    <EmptyState
     icon={<Users className="w-12 h-12" />}
     title={t('fasilitator.groups.emptyTitle')}
     description={t('fasilitator.groups.emptySession')}
    />
   ) : (
    <Card padding="sm">
     <div className="space-y-2">
      {groups.map((group) => {
       // Ownership: prefer the server's is_owner (role-aware); fall back to the
       // legacy client-side check when the flag is absent.
       const owned = group.is_owner ?? (bypass || group.facilitator_id === user?.id)
       const meta = (
        <div className="min-w-0">
         <p className="text-sm font-semibold text-on-surface truncate">{group.name}</p>
         {!owned && (
          <p className="text-xs text-on-surface-variant">{t('fasilitator.notMyGroup')}</p>
         )}
        </div>
       )

       if (!owned) {
        return (
         <button
          key={group.id}
          type="button"
          onClick={() => setShowLockedInfo(true)}
          aria-haspopup="dialog"
          title={t('fasilitator.notMyGroup')}
          className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl opacity-60 hover:bg-surface-container-low transition-colors text-left"
         >
          {meta}
          <Lock className="w-4 h-4 shrink-0 text-on-surface-variant" />
         </button>
        )
       }

       return (
        <button
         key={group.id}
         onClick={() =>
          navigate(ROUTES.FASILITATOR.GALERI_GROUP(group.id), {
           state: { sessionId: session.id, sessionName: session.name },
          })
         }
         className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
        >
         {meta}
         <span className="flex items-center gap-2 shrink-0">
          <Badge variant="primary" size="sm">{t('fasilitator.galeri.ownedBadge')}</Badge>
          <ChevronRight className="w-4 h-4 text-on-surface-variant" />
         </span>
        </button>
       )
      })}
     </div>
    </Card>
   )}

   {/* Explains why a non-owned group cannot be entered — the row itself stays
       put (no navigation) and is reachable by keyboard. */}
   <Modal
    open={showLockedInfo}
    onClose={() => setShowLockedInfo(false)}
    title={t('fasilitator.notMyGroup')}
    size="sm"
   >
    <p className="text-sm text-on-surface-variant">{t('fasilitator.galeri.lockedGroupDesc')}</p>
   </Modal>
  </div>
 )
}

export default GaleriSessionPage
