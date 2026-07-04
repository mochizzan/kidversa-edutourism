import { RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'

interface ProgramOption {
  value: string
  label: string
}

interface FrameUploadCardProps {
  id: string
  preview: string
  name: string
  programId: string
  programOptions: ProgramOption[]
  onUpdateName: (id: string, name: string) => void
  onUpdateProgram: (id: string, programId: string) => void
  onReplaceImage: (id: string) => void
  onRemove: (id: string) => void
}

export function FrameUploadCard({
  id, preview, name, programId, programOptions,
  onUpdateName, onUpdateProgram, onReplaceImage, onRemove,
}: FrameUploadCardProps) {
  return (
    <Card padding="sm" className="space-y-3">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface-container-high">
        <img src={preview} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="space-y-3">
        <Input label="Nama Frame" value={name} onChange={(e) => onUpdateName(id, e.target.value)} required />
        <Select label="Program" value={programId} onChange={(e) => onUpdateProgram(id, e.target.value)} options={programOptions} />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => onReplaceImage(id)}>Ganti Gambar</Button>
        <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onRemove(id)}>Hapus</Button>
      </div>
    </Card>
  )
}
