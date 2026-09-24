import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { FolderOpen, Calendar, Users, FileText, Play, BarChart3, Star } from 'lucide-react'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { CategoryCard } from '../../../shared/components/ui/CategoryCard'
import { SessionCarousel } from '../../../shared/components/data/SessionCarousel'
import { DonutStat } from '../../../shared/components/charts/DonutStat'
import { TeamList } from '../../../shared/components/data/TeamList'
import { KpiCard } from '../../../shared/components/charts/KpiCard'
import { RatingDistribution } from '../../../shared/components/charts/RatingDistribution'
import { AnalyticsTrendChart } from '../../../shared/components/charts/AnalyticsTrendChart'
import { ConsentOverview } from '../../../shared/components/charts/ConsentOverview'
import { TopSessions } from '../../../shared/components/charts/TopSessions'
import { AnalyticsFilters } from '../components/AnalyticsFilters'
import {
  buildDailySeries,
  dateKeysBetween,
  lastNDays,
  todayWibDateKey,
  wibDateKey,
} from '../utils/analytics'
import { FETCH_ALL_LIMIT } from '../../../core/constants/api'
import { i18n } from '../../../core/i18n'
import { useTranslation } from 'react-i18next'
import { programService } from '../../../core/services/programs'
import { sessionService } from '../../../core/services/sessions'
import { participantService } from '../../../core/services/participants'
import { userService } from '../../../core/services/users'
import { reportService } from '../../../core/services/reports'
import { assessmentService } from '../../../core/services/assessments'
import type { Participant, Session, User } from '../../../core/types'
import { SessionStatus, ReportStatus, UserRole } from '../../../core/types'

interface ActivityItem {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  icon: React.ElementType
  color: string
  route?: string
}

interface DashboardStats {
  totalPrograms: number
  activeSessions: number
  totalParticipants: number
  pendingReports: number
}

type DashboardTab = 'summary' | 'analytics'

const statusLabels: Record<string, string> = {
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  DRAFT: 'Draf',
  CANCELLED: 'Dibatalkan',
}

const roleLabels: Record<string, string> = {
  KOORDINATOR: 'Koordinator',
  FASILITATOR: 'Fasilitator',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

const DashboardPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeDashboardTab, setActiveDashboardTab] = useState<DashboardTab>('summary')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<DashboardStats>({
    totalPrograms: 0,
    activeSessions: 0,
    totalParticipants: 0,
    pendingReports: 0,
  })
  const [activeSessions, setActiveSessions] = useState<Session[]>([])
  const [teamMembers, setTeamMembers] = useState<User[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [programNames, setProgramNames] = useState<Record<string, string>>({})
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({})
  const [participants, setParticipants] = useState<Participant[]>([])
  const [allSessions, setAllSessions] = useState<Session[]>([])
  const [allReports, setAllReports] = useState<Array<{ status: string; session_id: string }>>([])
  const [allAssessments, setAllAssessments] = useState<
    Array<{ star_rating: number; session_id: string; assessed_at: string }>
  >([])
  const [allPrograms, setAllPrograms] = useState<Array<{ id: string; name: string }>>([])
  const [dateRange, setDateRange] = useState('30')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [statusFilter, setStatusFilter] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false

    const loadDashboard = async () => {
      try {
        setLoading(true)

        const [programsRes, sessionsRes, usersRes, participantsRes] = await Promise.all([
          programService.getAll({ limit: FETCH_ALL_LIMIT }),
          sessionService.getAll({ limit: 100 }),
          userService.getAll({ limit: 100 }),
          participantService.getAll({ limit: 1 }),
        ])

        if (cancelled) return

        const sessions = sessionsRes.data
        const active = sessions.filter((s) => s.status === SessionStatus.ACTIVE)

        const [participantLists, reportLists] = await Promise.all([
          Promise.all(sessions.map((s) => sessionService.getParticipants(s.id).catch(() => []))),
          Promise.all(sessions.map((s) => reportService.getBySession(s.id).catch(() => []))),
        ])

        if (cancelled) return

        const assessmentLists = await Promise.all(
          sessions.map((s) => assessmentService.getBySession(s.id).catch(() => [])),
        )
        if (cancelled) return

        const participantList = await participantService.getAll({ limit: 1000 }).catch(() => ({ data: [] as Participant[] }))
        setParticipants(participantList.data)

        const totalParticipants = participantsRes.total

        let pendingReportsCount = 0
        for (const reports of reportLists) {
          pendingReportsCount += reports.filter((r) => r.status === ReportStatus.PENDING_REVIEW).length
        }
        const reportsFlat = reportLists.flatMap((reports, index) => {
          const sessionId = sessions[index]?.id
          return sessionId
            ? reports.map((r) => ({ status: r.status, session_id: r.session_id || sessionId }))
            : []
        })
        const assessmentsFlat = assessmentLists.flatMap((list, index) => {
          const sessionId = sessions[index]?.id
          return sessionId
            ? list.map((a) => ({
              star_rating: a.star_rating,
              session_id: sessionId,
              assessed_at: a.assessed_at,
            }))
            : []
        })

        setStats({
          totalPrograms: programsRes.total,
          activeSessions: active.length,
          totalParticipants,
          pendingReports: pendingReportsCount,
        })

        setAllPrograms(programsRes.data.map((p) => ({ id: p.id, name: p.name })))

        setProgramNames(
          programsRes.data.reduce<Record<string, string>>((acc, program) => {
            acc[program.id] = program.name
            return acc
          }, {}),
        )

        setParticipantCounts(
          participantLists.reduce<Record<string, number>>((acc, sessionParticipants, index) => {
            const session = sessions[index]
            if (session) {
              acc[session.id] = sessionParticipants.length
            }
            return acc
          }, {}),
        )

        setAllSessions(sessions)
        setAllReports(reportsFlat)
        setAllAssessments(assessmentsFlat)

        setActiveSessions(active.slice(0, 6))

        const facilitatorsAndCoordinators = usersRes.data.filter(
          (u) => u.role === UserRole.FASILITATOR || u.role === UserRole.KOORDINATOR,
        )
        setTeamMembers(facilitatorsAndCoordinators.slice(0, 5))

        const activityList: ActivityItem[] = []

        const recentSessions = sessions
          .filter((s) => s.created_at)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 3)

        for (const s of recentSessions) {
          activityList.push({
            id: `session-${s.id}`,
            type: 'session_created',
            title: t('admin.dashboard.activity.sessionCreated'),
            description: s.name,
            timestamp: s.created_at,
            icon: Calendar,
            color: 'text-orange-600 bg-orange-100',
            route: `/admin/sessions/${s.id}`,
          })
        }

        if (active.length > 0) {
          activityList.push({
            id: `active-session`,
            type: 'session_active',
            title: t('admin.dashboard.activity.sessionActive'),
            description: t('admin.dashboard.activity.activeCount', { count: active.length }),
            timestamp: new Date().toISOString(),
            icon: Play,
            color: 'text-green-600 bg-green-100',
            route: ROUTES.ADMIN.SESSIONS,
          })
        }

        if (pendingReportsCount > 0) {
          activityList.push({
            id: `pending-reports`,
            type: 'reports_pending',
            title: t('admin.dashboard.activity.reportsPending'),
            description: t('admin.dashboard.activity.pendingCount', { count: pendingReportsCount }),
            timestamp: new Date().toISOString(),
            icon: FileText,
            color: 'text-purple-600 bg-purple-100',
            route: ROUTES.ADMIN.REPORTS,
          })
        }

        activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setActivities(activityList.slice(0, 8))
      } catch {
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => { cancelled = true }
  }, [])

  const sessionCards = activeSessions.map((session) => ({
    id: session.id,
    name: session.name,
    programName: programNames[session.program_id] ?? t('admin.dashboard.programMissing'),
    status: session.status,
    statusLabel: statusLabels[session.status] || session.status,
    sessionDate: session.session_date,
    location: session.location,
    participantCount: participantCounts[session.id] ?? 0,
  }))

  const teamListMembers = teamMembers.map((user) => ({
    id: user.id,
    name: user.name,
    role: roleLabels[user.role] || user.role,
    avatar: user.avatar_url,
  }))

  const rangeText = dateRange === 'all' ? t('admin.dashboard.rangeAll') : t('admin.dashboard.rangeDays', { count: Number(dateRange) })
  const now = new Date()

  const passesProgramStatus = (s: Session) =>
    (!selectedProgram || s.program_id === selectedProgram) &&
    (statusFilter.length === 0 || statusFilter.includes(s.status))

  const sessionsInProgramStatus = allSessions.filter(passesProgramStatus)
  const sessionById = new Map(allSessions.map((s) => [s.id, s]))
  const sessionsInProgramStatusIds = new Set(sessionsInProgramStatus.map((s) => s.id))

  // Registrations: program/status resolve through the linked session.
  // Participants not yet linked to a session only count when no session-level
  // filter (program/status) is active — otherwise they belong to no program.
  const registrationPool = participants.filter((p) => {
    if (p.session_id) {
      const session = sessionById.get(p.session_id)
      return session ? passesProgramStatus(session) : false
    }
    return !selectedProgram && statusFilter.length === 0
  })

  const assessmentsInProgramStatus = allAssessments.filter((a) =>
    sessionsInProgramStatusIds.has(a.session_id),
  )

  // Canonical date window (WIB) for every metric. "all" spans from the
  // earliest known event up to today; dateKeysBetween caps the span.
  const todayKey = todayWibDateKey(now)
  const earliestEventDate = [
    ...sessionsInProgramStatus.map((s) => s.session_date),
    ...registrationPool.map((p) => wibDateKey(p.created_at)),
    ...assessmentsInProgramStatus.map((a) => wibDateKey(a.assessed_at)),
  ]
    .filter((d): d is string => Boolean(d))
    .sort()[0]
  const rangeDates =
    dateRange === 'all'
      ? dateKeysBetween(earliestEventDate ?? todayKey, todayKey)
      : lastNDays(parseInt(dateRange, 10), now)
  const rangeSet = new Set(rangeDates)

  const filteredSessions = sessionsInProgramStatus.filter(
    (s) => !s.session_date || rangeSet.has(s.session_date),
  )

  const filteredSessionIds = new Set(filteredSessions.map((s) => s.id))

  const filteredParticipants = participants.filter(
    (p) => p.session_id && filteredSessionIds.has(p.session_id),
  )

  const registeredInRange = registrationPool.filter((p) => rangeSet.has(wibDateKey(p.created_at)))

  const ratedAssessments = assessmentsInProgramStatus.filter(
    (a) => a.assessed_at && rangeSet.has(wibDateKey(a.assessed_at)),
  )

  const filteredReports = allReports.filter((r) => filteredSessionIds.has(r.session_id))

  const activeInFiltered = filteredSessions.filter((s) => s.status === SessionStatus.ACTIVE).length

  const avgRating =
    ratedAssessments.length > 0
      ? (
        ratedAssessments.reduce((sum, a) => sum + a.star_rating, 0) / ratedAssessments.length
      ).toFixed(1)
      : '-'

  const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: ratedAssessments.filter((a) => a.star_rating === rating).length,
  }))

  const reportCountsByStatus = (Object.values(ReportStatus) as ReportStatus[]).map((status) => ({
    status,
    count: filteredReports.filter((r) => r.status === status).length,
  }))

  const photoConsented = filteredParticipants.filter((p) => p.consent_photo).length

  const filteredParticipantCounts = filteredSessions.reduce<Record<string, number>>(
    (acc, session) => {
      acc[session.id] = participants.filter((p) => p.session_id === session.id).length
      return acc
    },
    {},
  )

  const topSessions = filteredSessions
    .map((session) => ({
      name: session.name,
      count: filteredParticipantCounts[session.id] ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const trendSeries = buildDailySeries({
    dates: rangeDates,
    sessions: filteredSessions,
    participants: registrationPool,
    assessments: ratedAssessments,
  })

  const formatTimeAgo = (timestamp: string) => {
    const nowDate = new Date()
    const date = new Date(timestamp)
    const diffMs = nowDate.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return t('admin.dashboard.timeAgo.justNow')
    if (diffMins < 60) return t('admin.dashboard.timeAgo.minutes', { count: diffMins })
    if (diffHours < 24) return t('admin.dashboard.timeAgo.hours', { count: diffHours })
    if (diffDays < 7) return t('admin.dashboard.timeAgo.days', { count: diffDays })
    return date.toLocaleDateString(i18n.resolvedLanguage ?? 'id')
  }

  return (
    <div className="space-y-6">
      <Tabs
        activeKey={activeDashboardTab}
        onChange={(key) => setActiveDashboardTab(key as DashboardTab)}
        tabs={[
          { key: 'summary', label: t('admin.dashboard.tabSummary') },
          { key: 'analytics', label: t('admin.dashboard.tabAnalytics'), icon: <BarChart3 className="w-4 h-4" /> },
        ]}
      />

      {activeDashboardTab === 'summary' ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 xl:col-span-3 xl:order-2 space-y-6">
            <DonutStat />
            <TeamList members={teamListMembers} />
          </div>

          <div className="col-span-12 xl:col-span-9 xl:order-1 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <CategoryCard
                icon={FolderOpen}
                title={loading ? '...' : t('admin.dashboard.cat.programs', { count: stats.totalPrograms })}
                subtitle={t('admin.dashboard.cat.programsSub')}
                iconBg="bg-primary-container text-primary"
                onClick={() => navigate(ROUTES.ADMIN.PROGRAMS)}
              />
              <CategoryCard
                icon={Calendar}
                title={loading ? '...' : t('admin.dashboard.cat.sessions', { count: stats.activeSessions })}
                subtitle={t('admin.dashboard.cat.sessionsSub')}
                iconBg="bg-secondary-container text-secondary"
                onClick={() => navigate(ROUTES.ADMIN.SESSIONS)}
              />
              <CategoryCard
                icon={Users}
                title={loading ? '...' : t('admin.dashboard.cat.participants', { count: stats.totalParticipants })}
                subtitle={t('admin.dashboard.cat.participantsSub')}
                iconBg="bg-tertiary-container text-tertiary"
                onClick={() => navigate(ROUTES.ADMIN.PARTICIPANTS)}
              />
            </div>

            {sessionCards.length > 0 && <SessionCarousel sessions={sessionCards} title={t('admin.dashboard.activeSessionsTitle')} />}

            <div className="bg-surface rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-on-surface mb-4">{t('admin.dashboard.latestActivity')}</h2>

              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-start gap-4 p-3">
                      <div className="w-10 h-10 rounded-full bg-surface-container-high" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-surface-container-high rounded w-1/3" />
                        <div className="h-3 bg-surface-container-high rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <p className="text-on-surface-variant text-sm py-4">{t('admin.dashboard.noActivity')}</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => {
                    const Icon = activity.icon
                    return (
                      <button
                        key={activity.id}
                        onClick={() => activity.route && navigate(activity.route)}
                        disabled={!activity.route}
                        className={`w-full flex items-start gap-4 p-3 rounded-xl transition-all ${activity.route ? 'hover:bg-surface-container-low cursor-pointer' : 'cursor-default'
                          }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activity.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-on-surface">{activity.title}</p>
                          <p className="text-xs text-on-surface-variant">{activity.description}</p>
                        </div>
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">
                          {formatTimeAgo(activity.timestamp)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <AnalyticsFilters
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            programs={allPrograms}
            selectedProgram={selectedProgram}
            onProgramChange={setSelectedProgram}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<Users className="w-5 h-5" />}
              value={registeredInRange.length}
              label={t('admin.dashboard.kpi.registrants')}
              subtitle={t('admin.dashboard.kpi.registrantsSub', { range: rangeText })}
              accent="purple"
            />
            <KpiCard
              icon={<Calendar className="w-5 h-5" />}
              value={activeInFiltered}
              label={t('admin.dashboard.activeSessionsTitle')}
              subtitle={t('admin.dashboard.kpi.activeSub', { range: rangeText })}
              accent="amber"
            />
            <KpiCard
              icon={<Star className="w-5 h-5" />}
              value={avgRating}
              label={t('admin.dashboard.kpi.avgLabel')}
              subtitle={
                ratedAssessments.length > 0
                  ? t('admin.dashboard.kpi.avgSub', { count: ratedAssessments.length })
                  : t('admin.dashboard.kpi.avgEmpty')
              }
              accent="green"
            />
            <KpiCard
              icon={<FileText className="w-5 h-5" />}
              value={reportCountsByStatus.find((r) => r.status === ReportStatus.SENT)?.count ?? 0}
              label={t('admin.dashboard.kpi.sentLabel')}
              subtitle={t('admin.dashboard.kpi.sentSub', { count: filteredReports.length })}
              accent="purple"
            />
          </div>

          <AnalyticsTrendChart data={trendSeries} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RatingDistribution data={ratingDistribution} />
            <ConsentOverview
              photoConsented={photoConsented}
              total={filteredParticipants.length}
            />
          </div>

          <TopSessions data={topSessions} />
        </div>
      )}
    </div>
  )
}

export default DashboardPage