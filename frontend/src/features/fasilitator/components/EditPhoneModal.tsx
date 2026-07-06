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

const editPhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(8, 'Nomor telepon minimal 8 digit')
    .max(15, 'Nomor telepon maksimal 15 digit')
    .regex(/^\+?[1-9][\d\s-]*$/, 'Format nomor telepon tidak valid'),
})

type EditPhoneFormData = z.infer<typeof editPhoneSchema>

interface EditPhoneModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

const ERROR_MAP: Record<string, string> = {
  'User not found': 'Data pengguna tidak ditemukan. Silakan login ulang.',
}

const EditPhoneModal = ({ open, onClose, user, onSaved }: EditPhoneModalProps) => {
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
      addToast({ type: 'success', message: 'Nomor telepon berhasil diperbarui' })
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
      title="Edit Nomor Telepon"
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
          label="Nomor Telepon"
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
