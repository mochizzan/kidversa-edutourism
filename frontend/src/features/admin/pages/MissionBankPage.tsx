import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Pencil, Power, PowerOff, Trash2, FileText } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { DataTable } from '../../../shared/components/data/DataTable'
import type { Column } from '../../../shared/components/data/DataTable'
import { useMissionBank } from '../hooks/useMissionBank'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { MissionBank } from '../../../core/types'

const MissionBankPage = () => {
  const navigate = useNavigate()

  const {
    missions,
    programs,
    loading,
    error,
    page,
    total,
    selectedProgram,
    deactivateTarget,
    deactivating,
    deleteTarget,
    deleting,
    setSearchQuery,
    setPage,
    setSelectedProgram,
    setDeactivateTarget,
    setDeleteTarget,
    loadMissions,
    handleToggleActive,
    confirmToggle,
    handleDelete,
    confirmDelete,
    stageMap,
  } = useMissionBank()

  const programMap = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  )

  const currentAction = deactivateTarget?.is_active ? 'Nonaktifkan' : 'Aktifkan'

  const columns: Column<MissionBank>[] = [
    {
      key: 'title',
      header: 'Judul Misi',
      sortable: true,
      render: (item) => (
        <span className="font-medium text-on-surface">{item.title}</span>
      ),
    },
    {
      key: 'program_id',
      header: 'Program',
      render: (item) => (
        <span className="text-sm text-on-surface-variant">
          {programMap.get(item.program_id) || '-'}
        </span>
      ),
    },
    {
      key: 'related_stage_ids',
      header: 'Topik Terkait',
      render: (item) => {
        const ids = item.related_stage_ids
        if (!ids || ids.length === 0) {
          return <span className="text-sm text-on-surface-variant">—</span>
        }
        return (
          <div className="flex flex-wrap gap-1">
            {ids.slice(0, 3).map((stageId) => (
              <Badge key={stageId} variant="accent" size="sm">
                {stageMap[stageId]?.name ?? stageId.slice(-4)}
              </Badge>
            ))}
            {ids.length > 3 && (
              <Badge variant="neutral" size="sm">+{ids.length - 3}</Badge>
            )}
          </div>
        )
      },
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (item) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>
          {item.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <Link to={`/admin/missions/${item.id}/edit`}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Pencil className="w-4 h-4" />}
              tooltip="Edit"
            />
          </Link>
          {item.is_active ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<PowerOff className="w-4 h-4 text-warning" />}
              tooltip="Nonaktifkan"
              onClick={() => handleToggleActive(item)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Power className="w-4 h-4 text-green-600" />}
              tooltip="Aktifkan"
              onClick={() => setDeactivateTarget(item)}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-error" />}
            tooltip="Hapus"
            onClick={() => handleDelete(item)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Misi"
        subtitle="Kelola bank misi untuk program edutourism."
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate(ROUTES.ADMIN.MISSION_NEW)}
          >
            Tambah Misi Baru
          </Button>
        }
      />

      {error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadMissions}>
            Coba Lagi
          </Button>
        </div>
      )}

      <DataTable
        data={missions}
        columns={columns}
        loading={loading}
        page={page}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onSearch={setSearchQuery}
        getRowId={(item) => item.id}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-56">
              <Select
                options={[
                  { value: '', label: 'Semua Program' },
                  ...programs.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                placeholder="Semua Program"
              />
            </div>
          </div>
        }
        emptyState={
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="Belum ada misi"
            description={
              selectedProgram
                ? 'Belum ada misi untuk program ini. Klik "Tambah Misi Baru" untuk memulai.'
                : 'Pilih program atau klik "Tambah Misi Baru" untuk membuat misi pertama.'
            }
            action={
              selectedProgram
                ? { label: 'Tambah Misi Baru', onClick: () => navigate(ROUTES.ADMIN.MISSION_NEW) }
                : undefined
            }
          />
        }
      />

      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title={`${currentAction} Misi`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>
              Batal
            </Button>
            <Button
              variant={deactivateTarget?.is_active ? 'danger' : 'primary'}
              onClick={confirmToggle}
              loading={deactivating}
            >
              {currentAction}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin {currentAction.toLowerCase()} misi &ldquo;{deactivateTarget?.title}&rdquo;?
        </p>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Misi"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={deleting}
            >
              Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin menghapus misi &ldquo;{deleteTarget?.title}&rdquo;? Misi yang dihapus tidak dapat dikembalikan.
        </p>
      </Modal>
    </div>
  )
}

export default MissionBankPage
