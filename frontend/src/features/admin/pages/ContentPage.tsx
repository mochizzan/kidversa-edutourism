import { useState } from 'react'
import { Upload, Plus } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'

const ContentPage = () => {
  const [contents] = useState([
    { id: 'c-1', title: 'Intro Sapi', file_type: 'VIDEO', duration_seconds: 120, stage_id: 'ps-1' },
    { id: 'c-2', title: 'Quiz Sapi', file_type: 'GAME_BUNDLE', duration_seconds: 0, stage_id: 'ps-1' },
  ])
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola konten stage: video, gambar, audio, game.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>Tambah Konten</Button>
      </div>

      <div className="space-y-4">
        {contents.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{item.title}</p>
                <p className="text-sm text-gray-500">Stage: {item.stage_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="primary">{item.file_type}</Badge>
                {item.duration_seconds > 0 && <span className="text-sm text-gray-500">{item.duration_seconds}s</span>}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Tambah Konten" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={() => setOpen(false)}>Upload</Button>
        </div>
      }>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); }}>
          <Input label="Judul Konten" required />
          <Select label="Tipe File" options={[
            { value: 'VIDEO', label: 'Video' },
            { value: 'IMAGE', label: 'Image' },
            { value: 'AUDIO', label: 'Audio' },
            { value: 'GAME_BUNDLE', label: 'Game Bundle' },
          ]} />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Klik atau seret file ke sini</p>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ContentPage
