import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Button } from '../../../shared/components/ui/Button'
import type { ProgramStage, ContentType } from '../../../core/types'
import { ContentType as ContentTypeEnum } from '../../../core/types'

const contentTypes = [
  { value: ContentTypeEnum.VIDEO, label: 'Video' },
  { value: ContentTypeEnum.SLIDESHOW, label: 'Slideshow' },
  { value: ContentTypeEnum.GAME, label: 'Game' },
  { value: ContentTypeEnum.MIXED, label: 'Mixed' },
]

interface StageFormModalProps {
  open: boolean
  editingStage: ProgramStage | null
  onClose: () => void
  onSubmit: (data: Partial<ProgramStage>) => void
}

export function StageFormModal({ open, editingStage, onClose, onSubmit }: StageFormModalProps) {
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    const form = e.target as HTMLFormElement
    onSubmit({
      name: fd.get('name') as string,
      description: fd.get('description') as string,
      content_type: fd.get('content_type') as ContentType,
      duration_minutes: Number(fd.get('duration_minutes')),
      is_recording_stage: form.querySelector<HTMLInputElement>('[name="is_recording_stage"]')?.checked ?? false,
      is_photo_stage: form.querySelector<HTMLInputElement>('[name="is_photo_stage"]')?.checked ?? false,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={editingStage ? 'Edit Stage' : 'Tambah Stage'} footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button type="submit" form="stage-form">Simpan</Button>
      </div>
    }>
      <form id="stage-form" className="space-y-4" onSubmit={handleFormSubmit}>
        <Input label="Nama Stage" name="name" required defaultValue={editingStage?.name} />
        <Input label="Deskripsi" name="description" defaultValue={editingStage?.description} />
        <Select label="Tipe Konten" name="content_type" options={contentTypes} defaultValue={editingStage?.content_type || ContentTypeEnum.VIDEO} />
        <Input label="Durasi (menit)" name="duration_minutes" type="number" min={1} max={60} defaultValue={editingStage?.duration_minutes || 12} />
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" name="is_recording_stage" defaultChecked={editingStage?.is_recording_stage} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
            Recording Stage
          </label>
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input type="checkbox" name="is_photo_stage" defaultChecked={editingStage?.is_photo_stage ?? true} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
            Photo Stage
          </label>
        </div>
      </form>
    </Modal>
  )
}
