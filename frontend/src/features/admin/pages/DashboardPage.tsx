import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { FolderOpen, Calendar, Users, FileText, Play, BarChart3 } from 'lucide-react'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { CategoryCard } from '../../../shared/components/ui/CategoryCard'
import { SessionCarousel } from '../../../shared/components/data/SessionCarousel'
import { DonutStat } from '../../../shared/components/charts/DonutStat'
import { TeamList } from '../../../shared/components/data/TeamList'
import { ActivityBarChart } from '../../../shared/components/charts/ActivityBarChart'
import { programService } from '../../../core/services/programs'
import { sessionService } from '../../../core/services/sessions'
import { participantService } from '../../../core/services/participants'
import { userService } from '../../../core/services/users'
import { reportService } from '../../../core/services/reports'
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

  useEffect(() => {
    let cancelled = false

    const loadDashboard = async () => {
      try {
        setLoading(true)

        const [programsRes, sessionsRes, usersRes, participantsRes] = await Promise.all([
          programService.getAll({ limit: 1 }),
          sessionService.getAll({ limit: 100 }),
          userService.getAll({ limit: 100 }),
          participantService.getAll({ limit: 1 }),
        ])

        if (cancelled) return

        const allSessions = sessionsRes.data
        const active = allSessions.filter((s) => s.status === SessionStatus.ACTIVE)

        const [allParticipants, allReports] = await Promise.all([
          Promise.all(allSessions.map((s) => sessionService.getParticipants(s.id).catch(() => []))),
          Promise.all(allSessions.map((s) => reportService.getBySession(s.id).catch(() => []))),
        ])

        if (cancelled) return

        const participantList = await participantService.getAll({ limit: 1000 }).catch(() => ({ data: [] as Participant[] }))
        setParticipants(participantList.data)

        const totalParticipants = participantsRes.total

        let pendingReportsCount = 0
        for (const reports of allReports) {
          pendingReportsCount += reports.filter((r) => r.status === ReportStatus.PENDING_REVIEW).length
        }

        setStats({
          totalPrograms: programsRes.total,
          activeSessions: active.length,
          totalParticipants,
          pendingReports: pendingReportsCount,
        })

        setProgramNames(
          programsRes.data.reduce<Record<string, string>>((acc, program) => {
            acc[program.id] = program.name
            return acc
          }, {}),
        )

        setParticipantCounts(
          allParticipants.reduce<Record<string, number>>((acc, participants, index) => {
            const session = allSessions[index]
            if (session) {
              acc[session.id] = participants.length
            }
            return acc
          }, {}),
        )

        setActiveSessions(active.slice(0, 6))

        const facilitatorsAndCoordinators = usersRes.data.filter(
          (u) => u.role === UserRole.FASILITATOR || u.role === UserRole.KOORDINATOR
        )
        setTeamMembers(facilitatorsAndCoordinators.slice(0, 5))

        const activityList: ActivityItem[] = []

        const recentSessions = allSessions
          .filter((s) => s.created_at)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 3)

        for (const s of recentSessions) {
          activityList.push({
            id: `session-${s.id}`,
            type: 'session_created',
            title: 'Sesi Baru Dibuat',
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
            title: 'Sesi Sedang Berlangsung',
            description: `${active.length} sesi aktif`,
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
            title: 'Laporan Perlu Review',
            description: `${pendingReportsCount} laporan menunggu persetujuan`,
            timestamp: new Date().toISOString(),
            icon: FileText,
            color: 'text-purple-600 bg-purple-100',
            route: ROUTES.ADMIN.REPORTS,
          })
        }

        activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setActivities(activityList.slice(0, 8))
      } catch (error) {
        console.error('Failed to load dashboard:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => { cancelled = true }
  }, [])

  const weeklyRegistrations = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - index))
    const dateKey = date.toISOString().slice(0, 10)
    return {
      week: date.toLocaleDateString('id-ID', { weekday: 'short' }),
      count: participants.filter((participant) => participant.created_at.slice(0, 10) === dateKey).length,
    }
  })

  const sessionParticipation = activeSessions.map((session) => ({
    id: session.id,
    name: session.name,
    count: participantCounts[session.id] ?? 0,
  }))

  const sessionCards = activeSessions.map((session) => ({
    id: session.id,
    name: session.name,
    programName: programNames[session.program_id] ?? 'Program tidak ditemukan',
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

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Baru saja'
    if (diffMins < 60) return `${diffMins} menit lalu`
    if (diffHours < 24) return `${diffHours} jam lalu`
    if (diffDays < 7) return `${diffDays} hari lalu`
    return date.toLocaleDateString('id-ID')
  }

  return (
    <div className="space-y-6">
      <Tabs
        activeKey={activeDashboardTab}
        onChange={(key) => setActiveDashboardTab(key as DashboardTab)}
        tabs={[
          { key: 'summary', label: 'Ringkasan' },
          { key: 'analytics', label: 'Analitik', icon: <BarChart3 className="w-4 h-4" /> },
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
                title={loading ? '...' : `${stats.totalPrograms} Program`}
                subtitle="Total program"
                iconBg="bg-primary-container text-primary"
                onClick={() => navigate(ROUTES.ADMIN.PROGRAMS)}
              />
              <CategoryCard
                icon={Calendar}
                title={loading ? '...' : `${stats.activeSessions} Sesi`}
                subtitle="Sesi aktif"
                iconBg="bg-secondary-container text-secondary"
                onClick={() => navigate(ROUTES.ADMIN.SESSIONS)}
              />
              <CategoryCard
                icon={Users}
                title={loading ? '...' : `${stats.totalParticipants} Peserta`}
                subtitle="Total peserta"
                iconBg="bg-tertiary-container text-tertiary"
                onClick={() => navigate(ROUTES.ADMIN.PARTICIPANTS)}
              />
            </div>

            {sessionCards.length > 0 && <SessionCarousel sessions={sessionCards} title="Sesi Aktif" />}

            <div className="bg-surface rounded-3xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-on-surface mb-4">Aktivitas Terbaru</h2>

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
                <p className="text-on-surface-variant text-sm py-4">Belum ada aktivitas terbaru</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => {
                    const Icon = activity.icon
                    return (
                      <button
                        key={activity.id}
                        onClick={() => activity.route && navigate(activity.route)}
                        disabled={!activity.route}
                        className={`w-full flex items-start gap-4 p-3 rounded-xl transition-all ${
                          activity.route ? 'hover:bg-surface-container-low cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activity.color}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-on-surface">{activity.title}</p>
                          <p className="text-xs text-on-surface-variant">{activity.description}</p>
                        </div>
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">{formatTimeAgo(activity.timestamp)}</span>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ActivityBarChart title="Pendaftaran Peserta Mingguan" data={weeklyRegistrations} />

            <div className="bg-surface rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-on-surface">Status Peserta</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <p className="text-on-surface-variant">Belum masuk sesi</p>
                  <p className="text-2xl font-bold text-on-surface">{participants.filter((p) => !p.session_id).length}</p>
                </div>
                <div className="rounded-2xl bg-surface-container-low p-4">
                  <p className="text-on-surface-variant">Dalam sesi</p>
                  <p className="text-2xl font-bold text-on-surface">{participants.filter((p) => p.session_id).length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-3xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-on-surface mb-4">Partisipasi Sesi</h2>
            <div className="space-y-3">
              {sessionParticipation.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Belum ada sesi aktif.</p>
              ) : (
                sessionParticipation.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-2xl bg-surface-container-low p-4">
                    <span className="text-sm font-medium text-on-surface">{item.name}</span>
                    <span className="text-sm text-on-surface-variant">{item.count} peserta</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardPage
