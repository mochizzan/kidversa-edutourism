import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Badge } from '../../../shared/components/ui/Badge'
import { SessionCard } from '../components/SessionCard'
import { cn } from '../../../core/utils'
import type { Session } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

type FilterKey = 'all' | 'today' | 'completed' | 'cancelled'

const filterLabels: Record<FilterKey, string> = {
  all: 'Semua',
  today: 'Hari Ini',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
}

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  KOORDINATOR: 'Koordinator',
  FASILITATOR: 'Fasilitator',
}

const DashboardPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('today')
  const [switching, setSwitching] = useState(false)

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
    if (!user?.id) return
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
  }, [user?.id])

  const handleFilterChange = useCallback(async (filter: FilterKey) => {
    if (filter === activeFilter) return
    setSwitching(true)
    await fetchSessions(filter)
    setSwitching(false)
  }, [activeFilter, fetchSessions])

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

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-on-surface">
            Hai, {user?.name ?? 'Fasilitator'}!
          </h1>
        </div>
        <ErrorState message={error} onRetry={() => fetchSessions(activeFilter)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-on-surface">
            Hai, {user?.name ?? 'Fasilitator'}!
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="primary" size="sm">
              {roleLabel[user?.role ?? ''] ?? 'Fasilitator'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Semua Sesi */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-on-surface">Semua Sesi</h2>
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
                {filterLabels[key]}
              </button>
            ))}
          </div>
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title="Belum ada sesi"
            description={
              activeFilter === 'all'
                ? 'Anda belum ditugaskan di sesi manapun.'
                : `Tidak ada sesi untuk filter "${filterLabels[activeFilter]}".`
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={() => {
                  if (session.is_my_session) {
                    navigate(`/fasilitator/groups?sessionId=${session.id}`)
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default DashboardPage
