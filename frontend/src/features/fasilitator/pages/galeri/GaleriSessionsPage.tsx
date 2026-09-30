import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, ChevronRight, Image, Lock, MapPin } from 'lucide-react'
import { useAuth } from '../../../../core/hooks/useAuth'
import { sessionService } from '../../../../core/services/sessions'
import { ROUTES } from '../../../../core/constants/app'
import { SessionStatus, UserRole } from '../../../../core/types/enums'
import { PageHeader } from '../../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../../shared/components/feedback/ErrorState'
import { Card } from '../../../../shared/components/ui/Card'
import { Badge } from '../../../../shared/components/ui/Badge'
import { friendlyError } from '../../../../core/utils/errorMessages'
import type { Session } from '../../../../core/types'

/**
 * Galeri entry point: lists every ACTIVE session as a card.
 *
 * Ownership is per kelompok (session_groups.facilitator_id — Opsi A). Grounded
 * in backend/internal/infrastructure/persistence/session_repo.go:88-93: passing
 * `facilitator_id` to GET /api/sessions filters to sessions where the facilitator
 * owns at least one group (`sessions.id IN (SELECT session_id FROM session_groups
 * WHERE facilitator_id = ?)`), so a second list call yields the owned set.
 * A FASILITATOR sees non-owned sessions locked (aria-disabled); ADMIN /
 * KOORDINATOR / SUPER_ADMIN bypass the gate — mirroring useGroupOwnership.
 */
const GaleriSessionsPage = () => {
 const { t } = useTranslation()
 const { user } = useAuth()
 const navigate = useNavigate()

 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)
 const [sessions, setSessions] = useState<Session[]>([])
 const [ownedIds, setOwnedIds] = useState<Set<string> | null>(null)

 const bypass = !user || user.role !== UserRole.FASILITATOR

 const fetchData = useCallback(async (silent = false) => {
  try {
   if (!silent) setLoading(true)
   setError(null)
   const res = await sessionService.getAll({
    limit: 100,
    filters: { status: SessionStatus.ACTIVE },
   })
   if (bypass) {
    setSessions(res.data)
    setOwnedIds(null)
    return
   }
   // Same endpoint, facilitator_id filter → only sessions with ≥1 owned group.
   const mine = await sessionService.getAll({
    limit: 100,
    filters: { status: SessionStatus.ACTIVE, facilitator_id: user?.id },
   })
   setOwnedIds(new Set(mine.data.map((s) => s.id)))
   setSessions(res.data)
  } catch (err) {
   setError(friendlyError(err))
  } finally {
   if (!silent) setLoading(false)
  }
 }, [bypass, user?.id])

 useEffect(() => {
  fetchData()
 }, [fetchData])

 // Refetch on focus/visibility so a session that completed while the page sat
 // in the background drops off the ACTIVE list (mirrors CameraPage). Silent:
 // data refreshes in place without a skeleton flash.
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

 // ── Loading ──
 if (loading) {
  return (
   <div className="space-y-6">
    <PageHeader title={t('fasilitator.galeri.pageTitle')} subtitle={t('fasilitator.galeri.pageSubtitle')} />
    <div className="animate-pulse space-y-4">
     {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="bg-surface rounded-2xl p-5 h-24" />
     ))}
    </div>
   </div>
  )
 }

 // ── Error ──
 if (error) {
  return (
   <div className="space-y-6">
    <PageHeader title={t('fasilitator.galeri.pageTitle')} subtitle={t('fasilitator.galeri.pageSubtitle')} />
    <ErrorState message={error} onRetry={() => fetchData()} />
   </div>
  )
 }

 // ── Empty ──
 if (sessions.length === 0) {
  return (
   <div className="space-y-6">
    <PageHeader title={t('fasilitator.galeri.pageTitle')} subtitle={t('fasilitator.galeri.pageSubtitle')} />
    <EmptyState
     icon={<Image className="w-12 h-12" />}
     title={t('fasilitator.galeri.emptySessionsTitle')}
     description={t('fasilitator.galeri.emptySessionsDesc')}
    />
   </div>
  )
 }

 return (
  <div className="space-y-6">
   <PageHeader title={t('fasilitator.galeri.pageTitle')} subtitle={t('fasilitator.galeri.pageSubtitle')} />

   <Card padding="sm">
    <div className="space-y-2">
     {sessions.map((session) => {
      const enterable = bypass || ownedIds?.has(session.id) === true
      const ownerBadge = !bypass && enterable
      const meta = (
       <div className="min-w-0">
        <p className="text-sm font-semibold text-on-surface truncate">{session.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
         <Calendar className="w-3.5 h-3.5 shrink-0" />
         <span>{session.session_date}</span>
         {session.location && (
          <>
           <MapPin className="w-3.5 h-3.5 shrink-0 ml-1.5" />
           <span className="truncate">{session.location}</span>
          </>
         )}
        </p>
        {!enterable && (
         <p className="mt-1 text-xs text-on-surface-variant">
          {t('fasilitator.galeri.lockedSessionDesc')}
         </p>
        )}
       </div>
      )

      if (!enterable) {
       return (
        <div
         key={session.id}
         aria-disabled
         role="button"
         tabIndex={-1}
         title={t('fasilitator.galeri.lockedSessionDesc')}
         className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl opacity-60 cursor-not-allowed text-left"
        >
         {meta}
         <span className="flex items-center gap-2 shrink-0">
          <Badge variant="neutral" size="sm">{t('fasilitator.notMyGroup')}</Badge>
          <Lock className="w-4 h-4 text-on-surface-variant" />
         </span>
        </div>
       )
      }

      return (
       <button
        key={session.id}
        onClick={() => navigate(ROUTES.FASILITATOR.GALERI_SESSION(session.id))}
        className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
       >
        {meta}
        <span className="flex items-center gap-2 shrink-0">
         {ownerBadge && <Badge variant="primary" size="sm">{t('fasilitator.galeri.ownedBadge')}</Badge>}
         <ChevronRight className="w-4 h-4 text-on-surface-variant" />
        </span>
       </button>
      )
     })}
    </div>
   </Card>
  </div>
 )
}

export default GaleriSessionsPage
