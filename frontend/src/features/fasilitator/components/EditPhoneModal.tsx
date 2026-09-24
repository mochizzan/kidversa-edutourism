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
import { i18n } from '../../../core/i18n'
import { useTranslation } from 'react-i18next'

const editPhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, { error: () => ({ message: i18n.t('validation.phoneMin8') }) })
    .max(15, { error: () => ({ message: i18n.t('validation.phoneMax15') }) })
    .regex(/^\+?[1-9][\d\s-]*$/, { error: () => ({ message: i18n.t('validation.phoneFormat') }) }),
})

type EditPhoneFormData = z.infer<typeof editPhoneSchema>

interface EditPhoneModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

const ERROR_MAP: Record<string, () => string> = {
  'User not found': () => i18n.t('fasilitator.edit.userNotFound'),
}

const EditPhoneModal = ({ open, onClose, user, onSaved }: EditPhoneModalProps) => {
  const { t } = useTranslation()
  const { addToast } = useGlobalToast()
  const setUser = useAuthStore((s) => s.setUser)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditPhoneFormData>({
    resolver: zodResolver(editPhoneSchema),
    defaultValues: { phone: user.phone ?? '' },
  })

  useEffect(() => {
    if (open) {
      reset({ phone: user.phone ?? '' })
    }
  }, [open, user, reset])

  const onSubmit = async (data: EditPhoneFormData) => {
    try {
      const updated = await userService.update(user.id, { phone: data.phone.trim() })
      const { password_hash: _, ...cleanUser } = updated
      setUser(cleanUser as User)
      onSaved?.(cleanUser as User)
      addToast({ type: 'success', message: t('fasilitator.edit.phoneSaved') })
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
      title={t('fasilitator.edit.phoneTitle')}
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
          label={t('fasilitator.edit.phoneLabel')}
          type="tel"
          placeholder="08xxxxxxxxxx"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </form>
    </Modal>
  )
}

export default EditPhoneModal
