import { useState } from 'react'
import { Upload, Plus } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'

const ContentPage = () => {
  const [contents] = useState([
    { id: 'c-1', title: 'Intro Sapi', file_type: 'VIDEO', duration_seconds: 120, stage_id: 'ps-1' },
    { id: 'c-2', title: 'Quiz Sapi', file_type: 'GAME_BUNDLE', duration_seconds: 0, stage_id: 'ps-1' },
  ])
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Manager"
        subtitle="Kelola konten stage: video, gambar, audio, game."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setOpen(true)}>Tambah Konten</Button>
        }
      />

      <div className="space-y-4">
        {contents.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-on-surface">{item.title}</p>
                <p className="text-sm text-on-surface-variant">Stage: {item.stage_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="primary">{item.file_type}</Badge>
                {item.duration_seconds > 0 && <span className="text-sm text-on-surface-variant">{item.duration_seconds}s</span>}
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
          <div className="border-2 border-dashed border-outline-variant rounded-2xl p-8 text-center">
            <Upload className="w-8 h-8 text-on-surface-variant mx-auto mb-2" />
            <p className="text-sm text-on-surface-variant">Klik atau seret file ke sini</p>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default ContentPage
