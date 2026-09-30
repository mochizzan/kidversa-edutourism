import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { userService } from '../../../core/services/users'
import { ApiError } from '../../../core/services/backend-client'
import { useAuthStore } from '../../../core/stores/authStore'
import type { User } from '../../../core/types'
import { i18n } from '../../../core/i18n'
import { useTranslation } from 'react-i18next'

const editEmailSchema = z.object({
  email: z.string().trim().email({ error: () => ({ message: i18n.t('validation.emailInvalid') }) }),
})

type EditEmailFormData = z.infer<typeof editEmailSchema>

interface EditEmailModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

// Backend errors carry stable snake_case codes (MessageForCode maps them to
// Indonesian strings, so matching on the message never fires). conflict is
// the server-side uq_users_email authority — no client pre-check needed.
const ERROR_MAP: Record<string, () => string> = {
  forbidden: () => i18n.t('fasilitator.edit.noPermission'),
  not_found: () => i18n.t('fasilitator.edit.userNotFound'),
  conflict: () => i18n.t('fasilitator.edit.emailExists'),
}

const EditEmailModal = ({ open, onClose, user, onSaved }: EditEmailModalProps) => {
  const { t } = useTranslation()
  const { addToast } = useGlobalToast()
  const setUser = useAuthStore((s) => s.setUser)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditEmailFormData>({
    resolver: zodResolver(editEmailSchema),
    defaultValues: { email: user.email },
  })

  useEffect(() => {
    if (open) {
      reset({ email: user.email })
    }
  }, [open, user, reset])

  const onSubmit = async (data: EditEmailFormData) => {
    try {
      const trimmedEmail = data.email.trim().toLowerCase()
      // No client-side duplicate pre-check: GET /api/users is admin-only (the
      // pre-check 403'd for fasilitator) and racy anyway. The server enforces
      // uq_users_email and answers 409 conflict, mapped in ERROR_MAP below.
      const updated = await userService.update(user.id, { email: trimmedEmail })
      const { password_hash: _, ...cleanUser } = updated
      setUser(cleanUser as User)
      onSaved?.(cleanUser as User)
      addToast({ type: 'success', message: t('fasilitator.edit.emailSaved') })
      onClose()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      addToast({ type: 'error', message: ERROR_MAP[code]?.() ?? t('fasilitator.edit.saveFailed') })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('fasilitator.edit.emailTitle')}
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
          label={t('fasilitator.edit.emailLabel')}
          type="email"
          placeholder="nama@contoh.com"
          error={errors.email?.message}
          {...register('email')}
        />
      </form>
    </Modal>
  )
}

export default EditEmailModal
