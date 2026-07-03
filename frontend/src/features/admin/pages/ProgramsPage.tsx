import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, FolderOpen } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { programService } from '../../../core/services/programs'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

const ProgramsPage = () => {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await programService.getAll({ page, limit: 10, search })
      setPrograms(res.data)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page])

  useEffect(() => {
    const timeout = setTimeout(() => {
      load()
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  const handleToggle = async (id: string) => {
    await programService.toggleActive(id)
    load()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await programService.delete(deleteId)
    setDeleteId(null)
    load()
  }

  const columns: Column<Program>[] = [
    {
      key: 'name',
      header: 'Nama Program',
      sortable: true,
      render: (item: Program) => (
        <div>
          <p className="font-medium text-gray-900">{item.name}</p>
          <p className="text-sm text-gray-500">{item.description || '-'}</p>
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (item: Program) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Dibuat',
      render: (item: Program) => formatDate(item.created_at),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item: Program) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/admin/programs/${item.id}`}>
            <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} />
          </Link>
          <Button
            variant="ghost"
            size="sm"
            icon={item.is_active ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
            onClick={() => handleToggle(item.id)}
          />
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-red-500" />} onClick={() => setDeleteId(item.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programs"
        subtitle="Kelola program edutourism dan stage-nya."
        actions={
          <Link to="/admin/programs/new">
            <Button icon={<Plus className="w-4 h-4" />}>Buat Program</Button>
          </Link>
        }
      />

      <DataTable
        data={programs}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: Program) => item.id}
        actions={
          <Button variant="primary" icon={<Plus className="w-4 h-4" />}>
            Tambah Program
          </Button>
        }
        emptyState={
          <EmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title="Belum ada program"
            description="Buat program pertama untuk memulai."
            action={{ label: 'Buat Program', onClick: () => {} }}
          />
        }
      />

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Hapus Program" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-gray-600">Apakah Anda yakin ingin menghapus program ini?</p>
      </Modal>
    </div>
  )
}

export default ProgramsPage
