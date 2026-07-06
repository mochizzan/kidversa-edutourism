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

const editEmailSchema = z.object({
  email: z.string().trim().email('Format email tidak valid'),
})

type EditEmailFormData = z.infer<typeof editEmailSchema>

interface EditEmailModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

const ERROR_MAP: Record<string, string> = {
  EMAIL_EXISTS: 'Email sudah digunakan oleh akun lain',
  'User not found': 'Data pengguna tidak ditemukan. Silakan login ulang.',
}

const EditEmailModal = ({ open, onClose, user, onSaved }: EditEmailModalProps) => {
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
      if (trimmedEmail !== user.email.toLowerCase()) {
        const existing = await userService.getAll({ search: trimmedEmail })
        const duplicate = existing.data.find(
          (u) => u.id !== user.id && u.email.toLowerCase() === trimmedEmail
        )
        if (duplicate) {
          addToast({ type: 'error', message: 'Email sudah digunakan oleh akun lain' })
          return
        }
      }

      const updated = await userService.update(user.id, { email: trimmedEmail })
      const { password_hash: _, ...cleanUser } = updated
      setUser(cleanUser as User)
      onSaved?.(cleanUser as User)
      addToast({ type: 'success', message: 'Email berhasil diperbarui' })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      addToast({ type: 'error', message: ERROR_MAP[msg] ?? 'Gagal memperbarui data. Silakan coba lagi.' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Email"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            onClick={handleSubmit(onSubmit)}
          >
            Simpan
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
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
