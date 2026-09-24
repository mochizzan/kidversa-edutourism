import { useState } from 'react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import type { ProgramStage } from '../../../core/types'
import { BadgeEditor } from './BadgeEditor'
import { useTranslation } from 'react-i18next'

interface StageFormProps {
  editingStage: ProgramStage | null
  onSubmit: (data: {
    name: string
    description: string
    is_photo_stage: boolean
    badge_name: string
    badge_image_url: string
  }) => void
  onCancel: () => void
  submitting?: boolean
}

export function StageForm({ editingStage, onSubmit, onCancel, submitting = false }: StageFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(editingStage?.name ?? '')
  const [description, setDescription] = useState(editingStage?.description ?? '')
  const [isPhotoStage, setIsPhotoStage] = useState<boolean>(
    editingStage?.is_photo_stage ?? true
  )
  const [badgeName, setBadgeName] = useState(editingStage?.badge_name ?? '')
  const [badgeImageUrl, setBadgeImageUrl] = useState(editingStage?.badge_image_url ?? '')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSubmit({
      name,
      description,
      is_photo_stage: isPhotoStage,
      badge_name: badgeName,
      badge_image_url: badgeImageUrl,
    })
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Input
        label={t('admin.topic.nameLabel')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder={t('admin.topic.namePlaceholder')}
      />
      <Input
        label={t('admin.topic.descLabel')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('admin.topic.stageDescPlaceholder')}
      />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={isPhotoStage}
            onChange={(e) => setIsPhotoStage(e.target.checked)}
            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
          />
          {t('admin.topic.photoToggle')}
        </label>
      </div>

      <BadgeEditor
        title={t('admin.topic.badgeTitle')}
        variant="subtopik"
        name={badgeName}
        imageUrl={badgeImageUrl}
        helperText={t('admin.topic.badgeHelpStars')}
        onNameChange={setBadgeName}
        onImageChange={setBadgeImageUrl}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting}>{t('common.save')}</Button>
      </div>
    </form>
  )
}
