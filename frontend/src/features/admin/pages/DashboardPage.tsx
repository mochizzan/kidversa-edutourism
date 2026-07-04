import {
  FolderOpen,
  Calendar,
  Users,
} from 'lucide-react'
import { CategoryCard } from '../../../shared/components/ui/CategoryCard'
import { SessionCarousel } from '../../../shared/components/data/SessionCarousel'
import { DonutStat } from '../../../shared/components/charts/DonutStat'
import { TeamList } from '../../../shared/components/data/TeamList'
import {
  dashboardStats,
  recentSessions,
  teamMembers,
  sessionCards,
} from '../mock/dashboard'

const DashboardPage = () => {
  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Right sidebar — FIRST in DOM so it wraps to TOP on mobile/tablet */}
      <div className="col-span-12 xl:col-span-3 xl:order-2 space-y-6">
        <DonutStat />
        <TeamList members={teamMembers} />
      </div>

      {/* Left column — SECOND in DOM, order-1 on desktop */}
      <div className="col-span-12 xl:col-span-9 xl:order-1 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CategoryCard
            icon={FolderOpen}
            title={`${dashboardStats.totalPrograms} Program`}
            subtitle="Total program"
            iconBg="bg-primary-container text-primary"
          />
          <CategoryCard
            icon={Calendar}
            title={`${dashboardStats.activeSessions} Sesi`}
            subtitle="Sesi aktif"
            iconBg="bg-secondary-container text-secondary"
          />
          <CategoryCard
            icon={Users}
            title={`${dashboardStats.totalParticipants} Peserta`}
            subtitle="Total peserta"
            iconBg="bg-tertiary-container text-tertiary"
          />
        </div>

        <SessionCarousel sessions={sessionCards} />

        <div className="bg-surface rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-on-surface mb-4">Sesi Terbaru</h2>
          {/* Mobile: card layout */}
          <div className="md:hidden space-y-3">
            {recentSessions.map((session) => (
              <div key={session.id} className="bg-surface-container-low rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-on-surface">{session.name}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    session.status === 'ACTIVE' ? 'bg-primary-container text-on-primary-container' :
                    session.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    'bg-surface-variant text-on-surface-variant'
                  }`}>
                    {session.status === 'ACTIVE' ? 'Aktif' : session.status === 'COMPLETED' ? 'Selesai' : 'Draf'}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant truncate">{session.programName}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-container-high rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${session.completionRate}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{session.completionRate}%</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop/tablet: table layout */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Nama Sesi</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Program</th>
                  <th className="hidden lg:table-cell text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Tanggal</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Status</th>
                  <th className="hidden xl:table-cell text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-center">Peserta</th>
                  <th className="text-left py-3 px-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Progress</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((session) => (
                  <tr key={session.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-3 font-medium text-on-surface whitespace-nowrap">{session.name}</td>
                    <td className="py-3 px-3 text-on-surface-variant truncate max-w-[140px]">{session.programName}</td>
                    <td className="hidden lg:table-cell py-3 px-3 text-on-surface-variant whitespace-nowrap">{session.date}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        session.status === 'ACTIVE' ? 'bg-primary-container text-on-primary-container' :
                        session.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        'bg-surface-variant text-on-surface-variant'
                      }`}>
                        {session.status === 'ACTIVE' ? 'Aktif' : session.status === 'COMPLETED' ? 'Selesai' : 'Draf'}
                      </span>
                    </td>
                    <td className="hidden xl:table-cell py-3 px-3 text-on-surface-variant text-center">{session.participantCount}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 bg-surface-container-high rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${session.completionRate}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{session.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}

export default DashboardPage
