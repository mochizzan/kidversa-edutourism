import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Loader2, Camera } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { AvatarUploadModal } from '../../../shared/components/ui/AvatarUploadModal'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { userService } from '../../../core/services/users'
import { getTenantScope } from '../../../core/services/tenantScope'
import { resizeImage } from '../../../core/utils/image'
import type { UpdateUserDTO } from '../../../core/types'
import { UserRole } from '../../../core/types'

const roleOptions = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.KOORDINATOR, label: 'Koordinator Program' },
  { value: UserRole.FASILITATOR, label: 'Fasilitator' },
]

const UserFormPage = () => {
  const navigate = useNavigate()
  const { userId } = useParams()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(userId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: UserRole.FASILITATOR,
  })

  useEffect(() => {
    if (isEdit && userId) {
      userService.getById(userId).then((foundUser) => {
        if (foundUser) {
          setForm({
            name: foundUser.name,
            email: foundUser.email,
            password: '',
            phone: foundUser.phone || '',
            role: foundUser.role,
          })
          setAvatarPreview(foundUser.avatar_url || null)
        } else {
          addToast({ type: 'error', message: 'User tidak ditemukan' })
          navigate('/admin/users')
        }
        setLoading(false)
      })
    }
  }, [isEdit, userId, addToast, navigate])

  const handleAvatarUpload = async (file: File) => {
    try {
      const base64 = await resizeImage(file)
      setAvatarPreview(base64)
      setShowAvatarModal(false)
    } catch {
      addToast({ type: 'error', message: 'Gagal memproses gambar' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || (!isEdit && !form.password)) {
      addToast({ type: 'error', message: 'Lengkapi semua field yang wajib' })
      return
    }

    setSaving(true)
    try {
      if (isEdit && userId) {
        const payload: UpdateUserDTO = {
          name: form.name,
          email: form.email,
          role: form.role,
          phone: form.phone || undefined,
        }
        if (avatarPreview) payload.avatar_url = avatarPreview
        
        await userService.update(userId, payload)
        addToast({ type: 'success', message: 'User berhasil diperbarui' })
      } else {
        const scope = getTenantScope()
        if (scope.blocked || !scope.tenantId) {
          addToast({ type: 'error', message: 'Pilih tenant aktif terlebih dahulu.' })
          setSaving(false)
          return
        }
        await userService.create({
          tenant_id: scope.tenantId,
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          phone: form.phone || undefined,
          avatar_url: avatarPreview || undefined,
        })
        addToast({ type: 'success', message: 'User baru berhasil ditambahkan' })
      }
      navigate('/admin/users')
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menyimpan user' })
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
          { label: 'Users', href: '/admin/users' },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-6">
          
          <div className="flex items-center gap-4 pb-6 border-b border-outline-variant">
            <div className="relative w-16 h-16 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {form.name ? form.name.charAt(0).toUpperCase() : 'U'}
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
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <Input
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />

            {!isEdit && (
              <Input
                label="Password"
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            )}

            <Input
              label="No. HP"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />

            <Select
              label="Role"
              options={roleOptions}
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/admin/users')}>
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
