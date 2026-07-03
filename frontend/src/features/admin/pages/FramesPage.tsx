import { useState } from 'react'
import { Upload, Image } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { frameService } from '../../../core/services/frames'

const FramesPage = () => {
  const [frames, setFrames] = useState([
    { id: 'f-1', name: 'Frame Peternakan', program_id: 'p-1', is_active: true },
    { id: 'f-2', name: 'Frame Anak', program_id: 'p-1', is_active: true },
    { id: 'f-3', name: 'Default No Frame', program_id: undefined, is_active: true },
  ])
  const [open, setOpen] = useState(false)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    const frame = await frameService.create({
      tenant_id: 't-1',
      name: fd.get('name') as string,
      program_id: (fd.get('program_id') as string) || undefined,
      file_url: '/frames/new-frame.png',
      is_active: true,
      sort_order: frames.length,
    })
    setFrames([...frames, frame])
    setOpen(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Frame Manager"
        subtitle="Kelola frame PNG untuk Smart Photo."
        actions={
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => setOpen(true)}>Upload Frame</Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {frames.map((frame) => (
          <Card key={frame.id} className="hover:shadow-md transition-shadow">
            <div className="aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <Image className="w-12 h-12 text-gray-300" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900">{frame.name}</p>
                <Badge variant={frame.is_active ? 'success' : 'neutral'}>{frame.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
              </div>
              <p className="text-sm text-gray-500">{frame.program_id ? `Program: ${frame.program_id}` : 'Semua Program'}</p>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Upload Frame" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
          <Button onClick={(e) => { (e?.target as HTMLButtonElement).form?.requestSubmit() }}>Upload</Button>
        </div>
      }>
        <form className="space-y-4" onSubmit={handleUpload}>
          <Input label="Nama Frame" name="name" required />
          <Select label="Program" name="program_id" options={[
            { value: '', label: 'Semua Program' },
            { value: 'p-1', label: 'Edukasi Peternakan Sapi' },
            { value: 'p-2', label: 'Edukasi Pertanian Sayur' },
          ]} />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Upload PNG frame (1280x960 min, max 2MB)</p>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default FramesPage
