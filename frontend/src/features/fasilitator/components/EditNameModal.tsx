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

const editNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(50, 'Nama maksimal 50 karakter')
    .refine((v) => v.length > 0, 'Nama tidak boleh kosong'),
})

type EditNameFormData = z.infer<typeof editNameSchema>

interface EditNameModalProps {
  open: boolean
  onClose: () => void
  user: User
  onSaved?: (updated: User) => void
}

const ERROR_MAP: Record<string, string> = {
  'User not found': 'Data pengguna tidak ditemukan. Silakan login ulang.',
}

const EditNameModal = ({ open, onClose, user, onSaved }: EditNameModalProps) => {
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
      addToast({ type: 'success', message: 'Nama berhasil diperbarui' })
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
      title="Edit Nama"
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
          label="Nama Lengkap"
          placeholder="Masukkan nama lengkap"
          error={errors.name?.message}
          {...register('name')}
        />
      </form>
    </Modal>
  )
}

export default EditNameModal
