import { BookOpen, Clock, Award, TrendingUp } from 'lucide-react'

const DashboardPage = () => {
  const stats = [
    { label: 'Cerita Dibaca', value: '12', icon: <BookOpen className="w-6 h-6" />, change: '+3' },
    { label: 'Waktu Belajar', value: '8.5 jam', icon: <Clock className="w-6 h-6" />, change: '+1.5 jam' },
    { label: 'Pencapaian', value: '8', icon: <Award className="w-6 h-6" />, change: '+2' },
    { label: 'Progress', value: '75%', icon: <TrendingUp className="w-6 h-6" />, change: '+10%' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Anak</h1>

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
              <div className="p-3 bg-green-100 text-green-600 rounded-lg">
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

      {/* Continue Reading */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 mb-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Lanjutkan Membaca</h2>
        <div className="bg-gradient-to-r from-primary to-primary-light rounded-xl p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
              <BookOpen className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Petualangan di Candi Borobudur</h3>
              <p className="text-primary-200 text-sm mt-1">Bab 3: Misteri Stupa</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>65%</span>
                </div>
                <div className="w-full bg-white/30 rounded-full h-2">
                  <div className="bg-white h-2 rounded-full" style={{ width: '65%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Achievements */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pencapaian Terbaru</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '🏆', title: 'Pembaca Cepat', desc: 'Selesai 5 cerita' },
            { icon: '🌟', title: 'Pecinta Alam', desc: 'Selesai 3 cerita alam' },
            { icon: '📚', title: 'Rajin Membaca', desc: 'Baca 7 hari berturut' },
            { icon: '🎯', title: 'Ahli Kuis', desc: 'Skor 100% di 3 kuis' },
          ].map((achievement, index) => (
            <div
              key={index}
              className="text-center p-4 bg-accent-50 rounded-xl border border-accent-100"
            >
              <div className="text-3xl mb-2">{achievement.icon}</div>
              <h3 className="font-medium text-gray-800 text-sm">{achievement.title}</h3>
              <p className="text-xs text-gray-500 mt-1">{achievement.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
