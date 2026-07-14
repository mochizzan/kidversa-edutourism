import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { Resolver } from 'react-hook-form'
import { z } from 'zod'
import { ROUTES } from '../../../core/constants/app'
import { Save, Loader2, Camera } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { AvatarUploadModal } from '../../../shared/components/ui/AvatarUploadModal'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { userService } from '../../../core/services/users'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { redirectToLogin } from '../../../core/stores/authStore'
import { resolveStoredUpload } from '../../../core/utils/media'
import { ApiError } from '../../../core/services/backendClient'
import type { UpdateUserDTO } from '../../../core/types'
import { UserRole } from '../../../core/types'
import { PasswordStrengthBar } from '../../auth/components/PasswordStrengthBar'

const roleOptions = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.KOORDINATOR, label: 'Koordinator Program' },
  { value: UserRole.FASILITATOR, label: 'Fasilitator' },
]

const createUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .regex(/[A-Z]/, 'Harus ada huruf besar')
    .regex(/[a-z]/, 'Harus ada huruf kecil')
    .regex(/[0-9]/, 'Harus ada angka'),
  confirmPassword: z.string(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Password tidak cocok',
  path: ['confirmPassword'],
})

const updateUserSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
  email: z.string().email('Format email tidak valid'),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole),
})

type CreateFormData = z.infer<typeof createUserSchema>
type UpdateFormData = z.infer<typeof updateUserSchema>

const UserFormPage = () => {
  const navigate = useNavigate()
  const { userId } = useParams()
  const { addToast } = useGlobalToast()
  const { tenantId, requiresSelection } = useTenantScope()
  const isEdit = Boolean(userId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarFileRef = useRef<File | null>(null)

  const form = useForm<CreateFormData>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema) as unknown as Resolver<CreateFormData>,
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      role: UserRole.FASILITATOR,
    },
  })

  const { register, handleSubmit, reset, watch, formState: { errors } } = form

  useEffect(() => {
    if (isEdit && userId) {
      userService.getById(userId).then((foundUser) => {
        if (foundUser) {
          reset({
            name: foundUser.name,
            email: foundUser.email,
            phone: foundUser.phone || '',
            role: foundUser.role,
          } as UpdateFormData)
          setAvatarPreview(foundUser.avatar_url ? resolveStoredUpload(foundUser.avatar_url, 'avatar') ?? foundUser.avatar_url : null)
        } else {
          addToast({ type: 'error', message: 'User tidak ditemukan' })
          navigate(ROUTES.ADMIN.USERS)
        }
        setLoading(false)
      })
    }
  }, [isEdit, userId, addToast, navigate, reset])

  const handleAvatarUpload = async (file: File) => {
    try {
      avatarFileRef.current = file
      setAvatarPreview(URL.createObjectURL(file))
      setShowAvatarModal(false)
    } catch {
      addToast({ type: 'error', message: 'Gagal memproses gambar' })
    }
  }

  const onSubmit = async (data: CreateFormData) => {
    setSaving(true)
    try {
      if (isEdit && userId) {
        const payload: UpdateUserDTO = {
          name: data.name,
          email: data.email,
          role: data.role,
          phone: data.phone || undefined,
        }
        const updated = await userService.update(userId, payload)
        // Upload the avatar file separately (if changed) so it's stored as a
        // server path rather than a base64 blob in the avatar_url column.
        if (avatarFileRef.current) {
          await userService.uploadAvatar(userId, avatarFileRef.current)
        }
        addToast({ type: 'success', message: 'User berhasil diperbarui' })
        void updated
      } else {
        if (!tenantId) {
          addToast({ type: 'error', message: requiresSelection ? 'Pilih tenant aktif terlebih dahulu.' : 'Tenant belum tersedia.' })
          setSaving(false)
          return
        }
        const createData = data as CreateFormData
        const created = await userService.create({
          tenant_id: tenantId,
          name: createData.name,
          email: createData.email,
          password: createData.password,
          role: createData.role,
          phone: createData.phone || undefined,
        })
        if (avatarFileRef.current) {
          await userService.uploadAvatar(created.id, avatarFileRef.current)
        }
        addToast({ type: 'success', message: 'User baru berhasil ditambahkan' })
      }
      navigate(ROUTES.ADMIN.USERS)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          redirectToLogin()
          return
        }
        // Map common backend error codes to friendly messages.
        switch (err.code) {
          case 'validation_error':
            addToast({ type: 'error', message: 'Data tidak valid. Periksa kembali input Anda.' })
            break
          case 'conflict':
            addToast({ type: 'error', message: 'Email sudah terdaftar.' })
            break
          default:
            addToast({ type: 'error', message: err.message || 'Gagal menyimpan user' })
        }
      } else {
        addToast({ type: 'error', message: 'Gagal menyimpan user' })
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit User' : 'Tambah User Baru'}
        subtitle={isEdit ? 'Perbarui detail pengguna' : 'Buat akun pengguna baru'}
        breadcrumbs={[
          { label: 'Users', href: ROUTES.ADMIN.USERS },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-6">
           
          <div className="flex items-center gap-4 pb-6 border-b border-outline-variant">
            <div className="relative w-16 h-16 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {watch('name') ? watch('name').charAt(0).toUpperCase() : 'U'}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface mb-2">Foto Profil</p>
              <Tooltip content="Ubah foto profil">
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Ganti Foto
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nama Lengkap"
              required
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Email"
              type="email"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            {!isEdit && (
              <>
                <Input
                  label="Password"
                  type="password"
                  required
                  error={errors.password?.message}
                  {...register('password')}
                />
                <Input
                  label="Konfirmasi Password"
                  type="password"
                  required
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
                <PasswordStrengthBar password={watch('password') || ''} />
              </>
            )}

            <Input
              label="No. HP"
              error={errors.phone?.message}
              {...register('phone')}
            />

            <Select
              label="Role"
              options={roleOptions}
              error={errors.role?.message}
              {...register('role')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.USERS)}>
            Batal
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </form>

      <AvatarUploadModal
        open={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        currentAvatarUrl={avatarPreview || undefined}
        onUpload={handleAvatarUpload}
      />
    </div>
  )
}

export default UserFormPage
