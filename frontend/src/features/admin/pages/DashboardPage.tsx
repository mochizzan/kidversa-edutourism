import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Calendar, Users, Plus } from 'lucide-react'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'

type StatItem = {
  label: string
  value: number
  icon: React.ReactNode
  href: string
  accent: string
}

const DashboardPage = () => {
  const stats = useMemo<StatItem[]>(() => [
    {
      label: 'Total Programs',
      value: 3,
      icon: <FolderOpen className="w-6 h-6" />,
      href: '/admin/programs',
      accent: 'bg-primary-100 text-primary',
    },
    {
      label: 'Total Sessions',
      value: 4,
      icon: <Calendar className="w-6 h-6" />,
      href: '/admin/sessions',
      accent: 'bg-accent-100 text-accent-dark',
    },
    {
      label: 'Total Participants',
      value: 4,
      icon: <Users className="w-6 h-6" />,
      href: '/admin/sessions',
      accent: 'bg-green-100 text-green-700',
    },
  ], [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Ringkasan program dan sesi edutourism Anda.</p>
        </div>
        <Link to="/admin/programs">
          <Button icon={<Plus className="w-4 h-4" />}>Buat Program</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.href} className="block">
            <Card className="hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.accent}`}>{stat.icon}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Program Terbaru" subtitle="Program yang baru saja dibuat">
          <p className="text-sm text-gray-500">Lihat daftar program untuk mengelola stage dan konten.</p>
        </Card>
        <Card title="Sesi Aktif" subtitle="Sesi yang sedang berlangsung">
          <p className="text-sm text-gray-500">Pantau progress sesi dan kelola peserta.</p>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
