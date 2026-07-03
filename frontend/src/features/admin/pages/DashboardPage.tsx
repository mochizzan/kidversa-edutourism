import { Link } from 'react-router-dom'
import {
  FolderOpen,
  Calendar,
  Users,
  FileText,
  Plus,
} from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { StatCard } from '../../../shared/components/ui/StatCard'
import { BarChartAverage } from '../../../shared/components/charts/BarChartAverage'
import { PieChartDistribution } from '../../../shared/components/charts/PieChartDistribution'
import { ActivityFeed } from '../../../shared/components/data/ActivityFeed'
import { RecentSessions } from '../../../shared/components/data/RecentSessions'
import { DashboardLayout } from '../../../shared/components/layout/DashboardLayout'
import { Button } from '../../../shared/components/ui/Button'
import {
  dashboardStats,
  stageAverages,
  ratingDistribution,
  recentActivities,
  recentSessions,
} from '../mock/dashboard'

const DashboardPage = () => {
  const reportPercentage = Math.round(
    (dashboardStats.reportsSent / dashboardStats.reportsTotal) * 100
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan program dan sesi edutourism Anda."
        actions={
          <Link to="/admin/programs">
            <Button icon={<Plus className="w-4 h-4" />}>Buat Program</Button>
          </Link>
        }
      />

      <DashboardLayout
        sidebar={
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Program Aktif</span>
                <span className="text-sm font-semibold text-gray-900">
                  {dashboardStats.totalPrograms}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Sesi Berlangsung</span>
                <span className="text-sm font-semibold text-gray-900">
                  {dashboardStats.activeSessions}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Total Peserta</span>
                <span className="text-sm font-semibold text-gray-900">
                  {dashboardStats.totalParticipants}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Raport Terkirim</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {dashboardStats.reportsSent}/{dashboardStats.reportsTotal}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${reportPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            <Link
              to="/admin/sessions"
              className="block w-full text-center px-4 py-2 bg-primary-50 text-primary rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium"
            >
              Lihat Semua Sesi
            </Link>
          </div>
        }
      >
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Programs"
            value={dashboardStats.totalPrograms}
            icon={<FolderOpen className="w-6 h-6" />}
            href="/admin/programs"
            accent="bg-primary-100 text-primary"
            change={{ value: '+1 bulan ini', type: 'increase' }}
          />
          <StatCard
            label="Sesi Aktif"
            value={dashboardStats.activeSessions}
            icon={<Calendar className="w-6 h-6" />}
            href="/admin/sessions"
            accent="bg-accent-100 text-accent-dark"
            change={{ value: '+2 minggu ini', type: 'increase' }}
          />
          <StatCard
            label="Total Peserta"
            value={dashboardStats.totalParticipants}
            icon={<Users className="w-6 h-6" />}
            href="/admin/sessions"
            accent="bg-green-100 text-green-700"
            change={{ value: '+15 bulan ini', type: 'increase' }}
          />
          <StatCard
            label="Raport Terkirim"
            value={`${dashboardStats.reportsSent}/${dashboardStats.reportsTotal}`}
            icon={<FileText className="w-6 h-6" />}
            accent="bg-blue-100 text-blue-700"
            change={{ value: `${reportPercentage}% terkirim`, type: 'neutral' }}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChartAverage
            data={stageAverages}
            title="Rata-rata Nilai per Stage"
          />
          <PieChartDistribution
            data={ratingDistribution}
            title="Distribusi Penilaian"
          />
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityFeed
            activities={recentActivities}
            title="Aktivitas Terbaru"
            maxItems={5}
          />
          <RecentSessions
            sessions={recentSessions}
            title="Sesi Terbaru"
          />
        </div>
      </DashboardLayout>
    </div>
  )
}

export default DashboardPage
