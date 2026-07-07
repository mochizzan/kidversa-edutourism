import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, FolderOpen } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useCrudList } from '../../../shared/hooks/useCrudList'
import { programService } from '../../../core/services/programs'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

const ProgramsPage = () => {
  const navigate = useNavigate()
  const { data: programs, loading, page, total, setPage, setSearch, refresh } = useCrudList<Program>({
    fetchFn: (params) => programService.getAll({ ...params, limit: 10 }),
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { getHighlightClass } = useHighlight()

  const handleToggle = async (id: string) => {
    await programService.toggleActive(id)
    refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await programService.delete(deleteId)
    setDeleteId(null)
    refresh()
  }

  const columns: Column<Program>[] = [
    {
      key: 'name',
      header: 'Nama Program',
      sortable: true,
      render: (item: Program) => (
        <div>
          <p className="font-medium text-on-surface">{item.name}</p>
          <p className="text-sm text-on-surface-variant">{item.description || '-'}</p>
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
          <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit" onClick={() => navigate(`/admin/programs/${item.id}`)} />
          <Button
            variant="ghost"
            size="sm"
            icon={item.is_active ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
            tooltip="Ubah Status"
            onClick={() => handleToggle(item.id)}
          />
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Hapus" onClick={() => setDeleteId(item.id)} />
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
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate('/admin/programs/new')}>Buat Program</Button>
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
        rowClassName={(item: Program) => getHighlightClass(item.id)}
        emptyState={
          <EmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title="Belum ada program"
            description="Buat program pertama untuk memulai."
            action={{ label: 'Buat Program', onClick: () => navigate('/admin/programs/new') }}
          />
        }
      />

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Hapus Program" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus program ini?</p>
      </Modal>
    </div>
  )
}

export default ProgramsPage
