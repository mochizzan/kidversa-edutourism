import { Plus, Calendar, Clock, Users, Edit, Trash2 } from 'lucide-react'
import { useState } from 'react'

const ActivitiesPage = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  // Mock activities data
  const activities = [
    {
      id: '1',
      title: 'Storytelling: Petualangan di Laut',
      date: '2025-01-20',
      time: '09:00 - 10:00',
      participants: 15,
      status: 'upcoming',
    },
    {
      id: '2',
      title: 'Kuis: Pengetahuan Alam',
      date: '2025-01-20',
      time: '13:00 - 14:00',
      participants: 12,
      status: 'upcoming',
    },
    {
      id: '3',
      title: 'Workshop: Membuat Origami',
      date: '2025-01-19',
      time: '10:00 - 11:30',
      participants: 18,
      status: 'completed',
    },
  ]

  const filteredActivities = activities.filter(
    (activity) => activity.date === selectedDate
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Aktivitas</h1>
        <button className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600 transition-colors">
          <Plus className="w-5 h-5" />
          Tambah Aktivitas
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 mb-6">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-500">
            {filteredActivities.length} aktivitas ditemukan
          </span>
        </div>
      </div>

      {/* Activities List */}
      <div className="space-y-4">
        {filteredActivities.map((activity) => (
          <div
            key={activity.id}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-800">{activity.title}</h3>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      activity.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {activity.status === 'completed' ? 'Selesai' : 'Mendatang'}
                  </span>
                </div>
                <div className="flex items-center gap-6 text-sm text-gray-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{activity.date}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{activity.time}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{activity.participants} peserta</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                  <Edit className="w-5 h-5" />
                </button>
                <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredActivities.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 border border-gray-100 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Tidak ada aktivitas untuk tanggal ini</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivitiesPage
