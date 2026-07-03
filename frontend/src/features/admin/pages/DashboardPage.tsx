import { Users, BookOpen, MapPin, TrendingUp } from 'lucide-react'

const DashboardPage = () => {
  // Mock stats
  const stats = [
    { label: 'Total Users', value: '1,234', icon: <Users className="w-6 h-6" />, change: '+12%' },
    { label: 'Total Stories', value: '56', icon: <BookOpen className="w-6 h-6" />, change: '+8%' },
    { label: 'Total Destinations', value: '24', icon: <MapPin className="w-6 h-6" />, change: '+5%' },
    { label: 'Active Users', value: '892', icon: <TrendingUp className="w-6 h-6" />, change: '+15%' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
              </div>
              <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                {stat.icon}
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-green-500 font-medium">{stat.change}</span>
              <span className="text-gray-400 ml-2">dari bulan lalu</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Aktivitas Terbaru</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">User baru terdaftar</p>
              <p className="text-xs text-gray-500">2 menit yang lalu</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Story baru ditambahkan</p>
              <p className="text-xs text-gray-500">15 menit yang lalu</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Destinasi baru ditambahkan</p>
              <p className="text-xs text-gray-500">1 jam yang lalu</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
