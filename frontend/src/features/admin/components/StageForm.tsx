import { useState } from 'react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import type { ProgramStage } from '../../../core/types'

interface StageFormProps {
  editingStage: ProgramStage | null
  onSubmit: (data: {
    name: string
    description: string
    is_recording_stage: boolean
    is_photo_stage: boolean
  }) => void
  onCancel: () => void
  submitting?: boolean
}

export function StageForm({ editingStage, onSubmit, onCancel, submitting = false }: StageFormProps) {
  const [name, setName] = useState(editingStage?.name ?? '')
  const [description, setDescription] = useState(editingStage?.description ?? '')
  const [isRecordingStage, setIsRecordingStage] = useState<boolean>(
    editingStage?.is_recording_stage ?? false
  )
  const [isPhotoStage, setIsPhotoStage] = useState<boolean>(
    editingStage?.is_photo_stage ?? true
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit({
      name,
      description,
      is_recording_stage: isRecordingStage,
      is_photo_stage: isPhotoStage,
    })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Input
        label="Nama Stage"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="Nama stage"
      />
      <Input
        label="Deskripsi"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Deskripsi stage"
      />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={isRecordingStage}
            onChange={(e) => setIsRecordingStage(e.target.checked)}
            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
          />
          Recording Stage
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={isPhotoStage}
            onChange={(e) => setIsPhotoStage(e.target.checked)}
            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
          />
          Photo Stage
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" loading={submitting}>Simpan</Button>
      </div>
    </form>
  )
}
