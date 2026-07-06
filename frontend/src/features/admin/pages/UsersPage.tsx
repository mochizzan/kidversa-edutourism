import { useState } from 'react'
import { Plus, Pencil, Trash2, Camera } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { DataTable } from '../../../shared/components/data/DataTable'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useCrudList } from '../../../shared/hooks/useCrudList'
import { userService } from '../../../core/services/users'
import { resizeImage } from '../../../core/utils/image'
import { AvatarUploadModal } from '../../../shared/components/ui/AvatarUploadModal'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import type { Column } from '../../../shared/components/data/DataTable'
import type { User, UpdateUserDTO } from '../../../core/types'

const roleOptions = [
  { value: 'ADMIN_WISATA', label: 'Admin Wisata' },
  { value: 'KOORDINATOR', label: 'Koordinator Program' },
  { value: 'FASILITATOR', label: 'Fasilitator' },
]

const UsersPage = () => {
  const { data: users, loading, page, total, setPage, setSearch, refresh } = useCrudList<User>({
    fetchFn: (params) => userService.getAll({ ...params, limit: 10 }),
  })
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const { getHighlightClass } = useHighlight()
  const { addToast } = useGlobalToast()

  const handleAvatarUpload = async (file: File) => {
    try {
      const base64 = await resizeImage(file)
      setAvatarPreview(base64)
    } catch {
      addToast({ type: 'error', message: 'Gagal memproses gambar' })
      throw new Error('Gagal memproses gambar')
    }
  }

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    if (editingUser) {
      const payload: UpdateUserDTO = {
        name: fd.get('name') as string,
        email: fd.get('email') as string,
        role: fd.get('role') as User['role'],
        phone: fd.get('phone') as string || undefined,
      }
      if (avatarPreview) payload.avatar_url = avatarPreview
      await userService.update(editingUser.id, payload)
    } else {
      await userService.create({
        tenant_id: 't-1',
        name: fd.get('name') as string,
        email: fd.get('email') as string,
        password: fd.get('password') as string,
        role: fd.get('role') as User['role'],
        phone: fd.get('phone') as string || undefined,
      })
    }
    setAvatarPreview(null)
    setOpen(false)
    setEditingUser(null)
    refresh()
  }

  const handleDeactivate = async (id: string) => {
    await userService.deactivate(id)
    refresh()
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Nama',
      render: (item: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
            {item.avatar_url ? (
              <img src={item.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="text-xs font-bold text-primary">{item.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="font-medium text-on-surface">{item.name}</p>
            <p className="text-sm text-on-surface-variant">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (item: User) => <Badge variant="primary">{item.role}</Badge>,
    },
    {
      key: 'phone',
      header: 'No. HP',
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (item: User) => <Badge variant={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item: User) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit" onClick={() => { setEditingUser(item); setOpen(true) }} />
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Nonaktifkan" onClick={() => handleDeactivate(item.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Kelola pengguna sistem."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setEditingUser(null); setOpen(true) }}>Tambah User</Button>
        }
      />

      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: User) => item.id}
        rowClassName={(item: User) => getHighlightClass(item.id)}
      />

      {editingUser && (
        <AvatarUploadModal
          open={showAvatarModal}
          onClose={() => setShowAvatarModal(false)}
          currentAvatarUrl={editingUser.avatar_url}
          onUpload={handleAvatarUpload}
        />
      )}

      <Modal open={open} onClose={() => { setOpen(false); setEditingUser(null); setAvatarPreview(null) }} title={editingUser ? 'Edit User' : 'Tambah User'} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setOpen(false); setEditingUser(null); setAvatarPreview(null) }}>Batal</Button>
          <Button type="submit" form="user-form">Simpan</Button>
        </div>
      }>
        <form id="user-form" className="space-y-4" onSubmit={handleSave}>
          {editingUser && (
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-outline-variant">
              <div className="relative w-12 h-12 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="w-full h-full object-cover rounded-full" />
                ) : editingUser.avatar_url ? (
                  <img src={editingUser.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="text-lg font-bold text-primary">{editingUser.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <Tooltip content="Ubah foto profil">
                <button
                  type="button"
                  onClick={() => setShowAvatarModal(true)}
                  className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white shadow-md hover:bg-primary/90 transition-all"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          )}
          <Input label="Nama Lengkap" name="name" required defaultValue={editingUser?.name} />
          <Input label="Email" name="email" type="email" required defaultValue={editingUser?.email} />
          {!editingUser && <Input label="Password" name="password" type="password" required />}
          <Input label="No. HP" name="phone" defaultValue={editingUser?.phone} />
          <Select label="Role" name="role" options={roleOptions} defaultValue={editingUser?.role || 'FASILITATOR'} />
        </form>
      </Modal>
    </div>
  )
}

export default UsersPage
