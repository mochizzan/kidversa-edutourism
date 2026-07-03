import { Users, Activity, Calendar, TrendingUp } from 'lucide-react'

const DashboardPage = () => {
  // Mock stats
  const stats = [
    { label: 'Total Anak', value: '45', icon: <Users className="w-6 h-6" />, change: '+5' },
    { label: 'Aktivitas Hari Ini', value: '3', icon: <Activity className="w-6 h-6" />, change: '+1' },
    { label: 'Jadwal Minggu Ini', value: '8', icon: <Calendar className="w-6 h-6" />, change: '+2' },
    { label: 'Progress Rata-rata', value: '78%', icon: <TrendingUp className="w-6 h-6" />, change: '+10%' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Fasilitator Dashboard</h1>

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
              <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
                {stat.icon}
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-green-500 font-medium">{stat.change}</span>
              <span className="text-gray-400 ml-2">dari minggu lalu</span>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Activities */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Aktivitas Hari Ini</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-800">Storytelling Session</h3>
              <p className="text-sm text-gray-500">09:00 - 10:00 WIB</p>
            </div>
            <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
              Berlangsung
            </span>
          </div>
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-800">Kuis Interaktif</h3>
              <p className="text-sm text-gray-500">13:00 - 14:00 WIB</p>
            </div>
            <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
              Mendatang
            </span>
          </div>
        </div>
      </div>

      {/* Children Progress */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Progress Anak</h2>
        <div className="space-y-4">
          {[
            { name: 'Andi', progress: 85, stories: 12 },
            { name: 'Budi', progress: 72, stories: 10 },
            { name: 'Citra', progress: 90, stories: 15 },
          ].map((child, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold">
                {child.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-800">{child.name}</span>
                  <span className="text-sm text-gray-500">{child.stories} cerita</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${child.progress}%` }}
                  />
                </div>
              </div>
              <span className="text-sm font-medium text-gray-600">{child.progress}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
