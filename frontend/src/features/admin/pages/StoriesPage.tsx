import { Plus, Search, Edit, Trash2, Eye } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Tooltip } from '../../../shared/components/ui/Tooltip'

const StoriesPage = () => {
  const [searchQuery, setSearchQuery] = useState('')

  const stories = [
    {
      id: '1',
      title: 'Petualangan di Candi Borobudur',
      category: 'Sejarah',
      ageGroup: '6-8 tahun',
      status: 'Published',
      createdAt: '2025-01-15',
    },
    {
      id: '2',
      title: 'Misteri Hutan Mangrove',
      category: 'Lingkungan',
      ageGroup: '9-12 tahun',
      status: 'Draft',
      createdAt: '2025-01-14',
    },
    {
      id: '3',
      title: 'Belajar Membuat Batik',
      category: 'Budaya',
      ageGroup: '6-8 tahun',
      status: 'Published',
      createdAt: '2025-01-13',
    },
  ]

  const filteredStories = stories.filter(
    (story) =>
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stories"
        actions={
          <Button icon={<Plus className="w-4 h-4" />}>
            Tambah Story
          </Button>
        }
      />

      {/* Search */}
      <div className="bg-surface rounded-2xl shadow-sm p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Cari story..."
          />
        </div>
      </div>

      {/* Stories Table */}
      <div className="bg-surface rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Judul</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Kategori</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Usia</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-on-surface-variant uppercase tracking-wider">Tanggal</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-on-surface-variant uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {filteredStories.map((story) => (
              <tr key={story.id} className="hover:bg-surface-container-low/50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-on-surface">{story.title}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 text-xs font-medium bg-primary-container text-on-primary-container rounded-full">
                    {story.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant">{story.ageGroup}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                      story.status === 'Published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {story.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant">{story.createdAt}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <Tooltip content="Lihat">
                      <button className="p-1 text-on-surface-variant hover:text-primary">
                        <Eye className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Edit">
                      <button className="p-1 text-on-surface-variant hover:text-accent">
                        <Edit className="w-4 h-4" />
                      </button>
                    </Tooltip>
                    <Tooltip content="Hapus">
                      <button className="p-1 text-on-surface-variant hover:text-error">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StoriesPage
