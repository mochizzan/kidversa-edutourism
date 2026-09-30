import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { useAuthStore } from '../../../core/stores/authStore'
import { sessionService } from '../../../core/services/sessions'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Modal } from '../../../shared/components/ui/Modal'
import { SessionCard } from '../components/SessionCard'
import { cn } from '../../../core/utils'
import { SessionStatus } from '../../../core/types/enums'
import type { Session } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

type FilterKey = 'all' | 'today' | 'completed' | 'cancelled'

// Single notice modal shown instead of navigating: completed sessions, draft
// sessions (no groups yet), or an unknown/missing status at runtime.
type SessionNotice =
  | { kind: 'completed' }
  | { kind: 'draft' }
  | { kind: 'unknown'; status: string }
  | null

const filterLabels = {
  all: 'fasilitator.dashboard.filterAll',
  today: 'fasilitator.dashboard.filterToday',
  completed: 'fasilitator.dashboard.filterCompleted',
  cancelled: 'fasilitator.dashboard.filterCancelled',
} as const

const DashboardPage = () => {
  const { t } = useTranslation()
  const { user, isLoading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('today')
  const [switching, setSwitching] = useState(false)
  const [sessionNotice, setSessionNotice] = useState<SessionNotice>(null)
  // True only after auth has settled with no user — renders an explicit error
  // state instead of leaving the page on an infinite loading skeleton.
  const [noUser, setNoUser] = useState(false)

  const fetchSessions = useCallback(async (filter: FilterKey, isInitial = false) => {
    if (!user?.id) return
    if (isInitial) setLoading(true)
    setError(null)
    const today = new Date().toISOString().split('T')[0]
    const filters: Record<string, string | boolean | undefined> = { facilitator_id: user.id }
    if (filter === 'today') filters.session_date = today
    else if (filter === 'completed') filters.status = 'COMPLETED'
    else if (filter === 'cancelled') filters.status = 'CANCELLED'
    try {
      const res = await sessionService.getAll({ limit: 100, filters })
      setSessions(res.data)
      setActiveFilter(filter)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    // Auth still settling (checkSession refresh/GET /me in flight) → keep the
    // bounded skeleton; the effect re-runs once isLoading flips.
    if (authLoading) {
      setLoading(true)
      return
    }
    // Auth settled without a user (session lost / auth fetch failed): never
    // leave the page on a permanent skeleton — show an explicit error state.
    if (!user?.id) {
      setError(null)
      setNoUser(true)
      setLoading(false)
      return
    }
    setNoUser(false)
    let cancelled = false
    const init = async () => {
      // Try today first
      const today = new Date().toISOString().split('T')[0]
      const todayRes = await sessionService.getAll({
        limit: 100,
        filters: { facilitator_id: user.id, session_date: today },
      })
      if (cancelled) return
      if (todayRes.data.length > 0) {
        setSessions(todayRes.data)
        setActiveFilter('today')
      } else {
        const allRes = await sessionService.getAll({
          limit: 100,
          filters: { facilitator_id: user.id },
        })
        if (cancelled) return
        setSessions(allRes.data)
        setActiveFilter('all')
      }
    }
    setLoading(true)
    init().catch((err) => { if (!cancelled) setError(friendlyError(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user?.id, authLoading])

  const handleFilterChange = useCallback(async (filter: FilterKey) => {
    if (filter === activeFilter) return
    setSwitching(true)
    await fetchSessions(filter)
    setSwitching(false)
  }, [activeFilter, fetchSessions])

  // Explicit branch per session status: only ACTIVE/CANCELLED open the groups
  // page; COMPLETED/DRAFT/unknown show the notice modal and never navigate.
  const handleSessionClick = useCallback((session: Session) => {
    if (!session.is_my_session) return
    switch (session.status) {
      case SessionStatus.ACTIVE:
        navigate(`/fasilitator/groups?sessionId=${session.id}`)
        return
      case SessionStatus.CANCELLED:
        // Deliberately preserved: cancelled sessions still open the groups page.
        navigate(`/fasilitator/groups?sessionId=${session.id}`)
        return
      case SessionStatus.COMPLETED:
        setSessionNotice({ kind: 'completed' })
        return
      case SessionStatus.DRAFT:
        // Draft has no groups yet → explain instead of an empty groups page.
        setSessionNotice({ kind: 'draft' })
        return
      default:
        // Unknown/missing status: surface it, never navigate silently.
        setSessionNotice({ kind: 'unknown', status: String(session.status ?? 'UNKNOWN') })
    }
  }, [navigate])

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-container-high rounded w-48 animate-pulse" />
        <div className="h-5 bg-surface-container-high rounded w-32 animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 bg-surface-container-high rounded-2xl animate-pulse" />
          <div className="h-32 bg-surface-container-high rounded-2xl animate-pulse" />
        </div>
      </div>
    )
  }

  // ── No logged-in user after auth settled: explicit message, never a
  //    permanent skeleton. Retry re-runs the session check. ──
  if (noUser) {
    return (
      <ErrorState
        title={t('fasilitator.dashboard.noUserTitle')}
        message={t('fasilitator.dashboard.noUserDesc')}
        onRetry={() => { void useAuthStore.getState().checkSession() }}
      />
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <ErrorState message={error} onRetry={() => fetchSessions(activeFilter)} />
    )
  }

  return (
    <div className="space-y-6">
      {/* Semua Sesi */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-on-surface">{t('fasilitator.dashboard.allSessions')}</h2>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                disabled={switching}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                  activeFilter === key
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high/80',
                  switching && 'opacity-60 cursor-wait',
                )}
              >
                {t(filterLabels[key])}
              </button>
            ))}
          </div>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title={t('fasilitator.dashboard.emptyTitle')}
            description={
              activeFilter === 'all'
                ? t('fasilitator.dashboard.emptyAll')
                : t('fasilitator.dashboard.emptyFiltered', { filter: t(filterLabels[activeFilter]) })
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={() => handleSessionClick(session)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Notice modal — completed / draft / unknown status: buka modal, jangan navigasi */}
      <Modal
        open={sessionNotice !== null}
        onClose={() => setSessionNotice(null)}
        title={
          sessionNotice?.kind === 'draft'
            ? t('fasilitator.dashboard.sessionDraftTitle')
            : sessionNotice?.kind === 'unknown'
              ? t('fasilitator.dashboard.sessionUnknownTitle')
              : t('fasilitator.dashboard.sessionCompletedTitle')
        }
        size="sm"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setSessionNotice(null)}
              className="px-4 py-2 text-sm font-medium rounded-xl bg-primary text-on-primary hover:bg-primary/90 transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          {sessionNotice?.kind === 'draft'
            ? t('fasilitator.dashboard.sessionDraftDesc')
            : sessionNotice?.kind === 'unknown'
              ? t('fasilitator.dashboard.sessionUnknownDesc', { status: sessionNotice.status })
              : t('fasilitator.dashboard.sessionCompletedDesc')}
        </p>
      </Modal>
    </div>
  )
}

export default DashboardPage
