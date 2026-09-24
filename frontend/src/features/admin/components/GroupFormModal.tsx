import { useState, useEffect } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useTranslation } from 'react-i18next'

interface GroupFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  mode: 'create' | 'edit'
  initialName?: string
  existingNames: string[]
}

export function GroupFormModal({
  open,
  onClose,
  onSubmit,
  mode,
  initialName = '',
  existingNames,
}: GroupFormModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setError('')
    }
  }, [open, initialName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('admin.sessions.groupNameRequired'))
      return
    }

    // Check for duplicate names (case-insensitive), excluding current name in edit mode
    const normalizedName = trimmedName.toLowerCase()
    const isDuplicate = existingNames.some(
      (existing) =>
        existing.toLowerCase() === normalizedName &&
        (mode === 'create' || existing.toLowerCase() !== initialName.toLowerCase())
    )

    if (isDuplicate) {
      setError(t('admin.sessions.groupNameDuplicate'))
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(trimmedName)
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? t('admin.sessions.groupAdd') : t('admin.sessions.groupEdit')}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('admin.sessions.groupNameLabel')}
          placeholder={t('admin.sessions.groupNamePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          required
          autoFocus
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={submitting}>
            {mode === 'create' ? t('admin.common.add') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
