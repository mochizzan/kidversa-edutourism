import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { userService } from '../../../core/services/users'
import { useAuthStore } from '../../../core/stores/authStore'
import type { User } from '../../../core/types'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../core/i18n'

const editNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: () => ({ message: i18n.t('validation.nameMin') }) })
    .max(50, { error: () => ({ message: i18n.t('validation.nameMax50') }) })
    .refine((v) => v.length > 0, { error: () => ({ message: i18n.t('validation.nameEmpty') }) }),
})

type EditNameFormData = z.infer<typeof editNameSchema>

interface EditNameModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

const ERROR_MAP: Record<string, () => string> = {
  'User not found': () => i18n.t('fasilitator.edit.userNotFound'),
}

const EditNameModal = ({ open, onClose, user, onSaved }: EditNameModalProps) => {
  const { t } = useTranslation()
  const { addToast } = useGlobalToast()
  const setUser = useAuthStore((s) => s.setUser)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditNameFormData>({
    resolver: zodResolver(editNameSchema),
    defaultValues: { name: user.name },
  })

  useEffect(() => {
    if (open) {
      reset({ name: user.name })
    }
  }, [open, user, reset])

  const onSubmit = async (data: EditNameFormData) => {
    try {
      const updated = await userService.update(user.id, { name: data.name })
      const { password_hash: _, ...cleanUser } = updated
      setUser(cleanUser as User)
      onSaved?.(cleanUser as User)
      addToast({ type: 'success', message: t('fasilitator.edit.nameSaved') })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      addToast({ type: 'error', message: ERROR_MAP[msg]?.() ?? t('fasilitator.edit.saveFailed') })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('fasilitator.edit.nameTitle')}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label={t('fasilitator.edit.nameLabel')}
          placeholder={t('fasilitator.edit.namePlaceholder')}
          error={errors.name?.message}
          {...register('name')}
        />
      </form>
    </Modal>
  )
}

export default EditNameModal
