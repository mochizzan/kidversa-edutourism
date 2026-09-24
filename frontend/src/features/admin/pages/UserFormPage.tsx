import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
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
import { PhoneInput } from '../../../shared/components/ui/PhoneInput'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { userService } from '../../../core/services/users'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { useAuth } from '../../../core/hooks/useAuth'
import { redirectToLogin } from '../../../core/stores/authStore'
import { getMediaUrl } from '../../../core/utils/media'
import { ApiError } from '../../../core/services/backend-client'
import { friendlyError } from '../../../core/utils/errorMessages'
import { UserRole } from '../../../core/types'
import type { UpdateUserDTO } from '../../../core/types'
import { zEmail, zPassword, zPhone } from '../../../core/utils/validation'
import { i18n } from '../../../core/i18n'
import { PasswordStrengthBar } from '../../auth/components/PasswordStrengthBar'
import { useTranslation } from 'react-i18next'

// zodResolver returns a schema-specific resolver; when isEdit is true the
// update schema lacks password/confirmPassword, so the types don't overlap.
// This helper bridges the mismatch safely.
function toCreateResolver(r: Resolver<CreateFormData | UpdateFormData>): Resolver<CreateFormData> {
  return r as Resolver<CreateFormData>
}

export const createUserSchema = z.object({
  name: z.string().min(2, { error: () => ({ message: i18n.t('validation.nameMin') }) }).max(100, { error: () => ({ message: i18n.t('validation.nameMax') }) }),
  email: zEmail({ required: true }),
  password: zPassword,
  confirmPassword: z.string(),
  phone: zPhone({ required: false }),
  role: z.nativeEnum(UserRole),
}).refine((d) => d.password === d.confirmPassword, {
  error: () => ({ message: i18n.t('validation.confirmMismatch') }),
  path: ['confirmPassword'],
})

export const updateUserSchema = z.object({
  name: z.string().min(2, { error: () => ({ message: i18n.t('validation.nameMin') }) }).max(100, { error: () => ({ message: i18n.t('validation.nameMax') }) }),
  email: zEmail({ required: true }),
  phone: zPhone({ required: false }),
  role: z.nativeEnum(UserRole),
})

type CreateFormData = z.infer<typeof createUserSchema>
type UpdateFormData = z.infer<typeof updateUserSchema>

const roleOptions = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.KOORDINATOR, label: 'Koordinator Program' },
  { value: UserRole.FASILITATOR, label: 'Fasilitator' },
]

const UserFormPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { userId } = useParams()
  const { addToast } = useGlobalToast()
  const { tenantId, requiresSelection } = useTenantScope()
  const { user: currentUser } = useAuth()
  const isEdit = Boolean(userId)
  // A user may never reassign their own role (backend enforces this too);
  // disable the field and strip role from the payload on self-edit.
  const isSelfEdit = Boolean(userId && currentUser?.id === userId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)

  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarFileRef = useRef<File | null>(null)

  const form = useForm<CreateFormData>({
    resolver: toCreateResolver(zodResolver(isEdit ? updateUserSchema : createUserSchema)),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      role: UserRole.FASILITATOR,
    },
  })

  const { register, handleSubmit, reset, watch, control, formState: { errors } } = form

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
          setAvatarPreview(foundUser.avatar_url ? getMediaUrl('avatar', foundUser.id) : null)
        } else {
          addToast({ type: 'error', message: t('admin.users.notFound') })
          navigate(ROUTES.ADMIN.USERS)
        }
        setLoading(false)
      })
    }
  }, [isEdit, userId, addToast, navigate, reset, t])

  const handleAvatarUpload = async (file: File) => {
    try {
      avatarFileRef.current = file
      setAvatarPreview(URL.createObjectURL(file))
      setShowAvatarModal(false)
    } catch {
      addToast({ type: 'error', message: t('admin.users.imageError') })
    }
  }

  const onSubmit = async (data: CreateFormData) => {
    setSaving(true)
    try {
      if (isEdit && userId) {
        const payload: UpdateUserDTO = {
          name: data.name,
          email: data.email,
          phone: data.phone || undefined,
        }
        // Never send role on a self-edit: the backend rejects self-role-change,
        // but we also avoid persisting any stale value via the disabled control.
        if (!isSelfEdit) {
          payload.role = data.role
        }
        const updated = await userService.update(userId, payload)
        // Upload the avatar file separately (if changed) so it's stored as a
        // server path rather than a base64 blob in the avatar_url column.
        if (avatarFileRef.current) {
          await userService.uploadAvatar(userId, avatarFileRef.current)
        }
        addToast({ type: 'success', message: t('admin.users.updatedToast') })
        void updated
      } else {
        if (!tenantId) {
          addToast({ type: 'error', message: requiresSelection ? t('admin.users.selectTenant') : t('admin.users.tenantUnavailable') })
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
        addToast({ type: 'success', message: t('admin.users.createdToast') })
      }
      navigate(ROUTES.ADMIN.USERS)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          redirectToLogin()
          return
        }
        addToast({ type: 'error', message: friendlyError(err) })
      } else {
        addToast({ type: 'error', message: t('admin.users.saveError') })
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
        title={isEdit ? t('admin.users.editTitle') : t('admin.users.newTitle')}
        subtitle={isEdit ? t('admin.users.editSubtitle') : t('admin.users.newSubtitle')}
        breadcrumbs={[
          { label: t('admin.sidebar.users'), href: ROUTES.ADMIN.USERS },
          { label: isEdit ? t('admin.common.edit') : t('admin.common.add') },
        ]}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-6">

          <div className="flex items-center gap-4 pb-6 border-b border-outline-variant">
            <div className="relative w-16 h-16 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt={t('admin.users.avatarAlt')} className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {watch('name') ? watch('name').charAt(0).toUpperCase() : 'U'}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-on-surface mb-2">{t('admin.users.photoLabel')}</p>
              <Tooltip content={t('admin.users.changePhoto')}>
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  {t('admin.users.changePhotoBtn')}
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('auth.field.name')}
              required
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label={t('auth.field.email')}
              type="email"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            {!isEdit && (
              <>
                <Input
                  label={t('auth.field.password')}
                  type="password"
                  required
                  error={errors.password?.message}
                  {...register('password')}
                />
                <Input
                  label={t('auth.field.confirmPassword')}
                  type="password"
                  required
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
                <PasswordStrengthBar password={watch('password') || ''} />
              </>
            )}

            <div className="md:col-span-2">
              <Controller
                control={control}
                name="phone"
                render={({ field, fieldState }) => (
                  <PhoneInput
                    id="user_phone"
                    label={t('admin.users.phoneLabel')}
                    value={field.value || ''}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    placeholder="8123456789"
                  />
                )}
              />
            </div>

            <Select
              label={t('admin.col.role')}
              options={roleOptions}
              error={errors.role?.message}
              disabled={isSelfEdit}
              {...register('role')}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.USERS)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {isEdit ? t('common.save') : t('admin.common.add')}
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
