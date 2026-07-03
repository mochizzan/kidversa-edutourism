import { Search, BookOpen, Star, Clock } from 'lucide-react'
import { useState } from 'react'

const StoriesPage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  // Mock stories data
  const stories = [
    {
      id: '1',
      title: 'Petualangan di Candi Borobudur',
      category: 'Sejarah',
      ageGroup: '6-8 tahun',
      rating: 4.8,
      duration: '15 menit',
      imageUrl: null,
      progress: 65,
    },
    {
      id: '2',
      title: 'Misteri Hutan Mangrove',
      category: 'Lingkungan',
      ageGroup: '9-12 tahun',
      rating: 4.9,
      duration: '20 menit',
      imageUrl: null,
      progress: 0,
    },
    {
      id: '3',
      title: 'Belajar Membuat Batik',
      category: 'Budaya',
      ageGroup: '6-8 tahun',
      rating: 4.7,
      duration: '12 menit',
      imageUrl: null,
      progress: 100,
    },
    {
      id: '4',
      title: 'Petualangan di Laut',
      category: 'Sains',
      ageGroup: '9-12 tahun',
      rating: 4.6,
      duration: '18 menit',
      imageUrl: null,
      progress: 30,
    },
  ]

  const categories = ['all', 'Sejarah', 'Lingkungan', 'Budaya', 'Sains']

  const filteredStories = stories.filter(
    (story) =>
      (selectedCategory === 'all' || story.category === selectedCategory) &&
      story.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Cerita</h1>

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Cari cerita..."
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category === 'all' ? 'Semua' : category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStories.map((story) => (
          <div
            key={story.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Thumbnail */}
            <div className="h-40 bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <BookOpen className="w-12 h-12 text-white/80" />
            </div>

            {/* Content */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                  {story.category}
                </span>
                <span className="text-xs text-gray-500">{story.ageGroup}</span>
              </div>
              <h3 className="font-semibold text-gray-800 mb-2">{story.title}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span>{story.rating}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{story.duration}</span>
                </div>
              </div>

              {/* Progress */}
              {story.progress > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">Progress</span>
                    <span className="font-medium text-gray-700">{story.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${
                        story.progress === 100 ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${story.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Button */}
              <button
                className={`w-full py-2 rounded-lg font-medium transition-colors ${
                  story.progress === 100
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : story.progress > 0
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {story.progress === 100
                  ? 'Selesai ✓'
                  : story.progress > 0
                  ? 'Lanjutkan'
                  : 'Mulai Baca'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StoriesPage
