import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { DataTable } from '../../../shared/components/data/DataTable'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { userService } from '../../../core/services/users'
import type { Column } from '../../../shared/components/data/DataTable'
import type { User } from '../../../core/types'

const roleOptions = [
  { value: 'ADMIN_WISATA', label: 'Admin Wisata' },
  { value: 'KOORDINATOR', label: 'Koordinator Program' },
  { value: 'FASILITATOR', label: 'Fasilitator' },
]

const UsersPage = () => {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await userService.getAll({ page, limit: 10, search })
      setUsers(res.data)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page])

  useEffect(() => {
    const timeout = setTimeout(load, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.target as HTMLFormElement)
    if (editingUser) {
      await userService.update(editingUser.id, {
        name: fd.get('name') as string,
        email: fd.get('email') as string,
        role: fd.get('role') as User['role'],
        phone: fd.get('phone') as string || undefined,
      })
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
    setOpen(false)
    setEditingUser(null)
    load()
  }

  const handleDeactivate = async (id: string) => {
    await userService.deactivate(id)
    load()
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Nama',
      render: (item: User) => <div><p className="font-medium text-on-surface">{item.name}</p><p className="text-sm text-on-surface-variant">{item.email}</p></div>,
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
      />

      <Modal open={open} onClose={() => { setOpen(false); setEditingUser(null) }} title={editingUser ? 'Edit User' : 'Tambah User'} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setOpen(false); setEditingUser(null) }}>Batal</Button>
          <Button type="submit" form="user-form">Simpan</Button>
        </div>
      }>
        <form id="user-form" className="space-y-4" onSubmit={handleSave}>
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
