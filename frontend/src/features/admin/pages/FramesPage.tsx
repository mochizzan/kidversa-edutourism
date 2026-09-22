import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES, IMAGE_FALLBACK_SRC } from '../../../core/constants/app'
import { Upload, Image, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { DataTable } from '../../../shared/components/data/DataTable'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { frameService } from '../../../core/services/frames'
import { programService } from '../../../core/services/programs'
import { cn } from '../../../core/utils'
import { friendlyError } from '../../../core/utils/errorMessages'
import { getMediaUrl } from '../../../core/utils/media'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import { formatDate } from '../../../shared/utils'
import { FramePreviewOverlay } from '../components/FramePreviewOverlay'
import type { Column } from '../../../shared/components/data/DataTable'
import type { PhotoFrame, Program } from '../../../core/types'

const frameTextFilter = makeTextFilter<PhotoFrame>(['name'])

const STATUS_FILTERS: { key: 'all' | 'active' | 'inactive'; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Nonaktif' },
]

const FramesPage = () => {
  const navigate = useNavigate()
  const { tenantId } = useTenantScope()
  const { addToast } = useGlobalToast()
  const [programs, setPrograms] = useState<Program[]>([])
  const [programError, setProgramError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [programFilter, setProgramFilter] = useState('all')
  const [sort, setSort] = useState<{ key: 'name' | 'created_at'; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PhotoFrame | null>(null)

  const programMap = useMemo(
    () => new Map(programs.map((p) => [p.id, p.name])),
    [programs],
  )

  const filterFn = useCallback((items: PhotoFrame[], search: string) => {
    let out = frameTextFilter(items, search)
    if (statusFilter === 'active') out = out.filter((f) => f.is_active)
    else if (statusFilter === 'inactive') out = out.filter((f) => !f.is_active)
    if (programFilter !== 'all') out = out.filter((f) => (f.program_id ?? '') === programFilter)
    return out
  }, [statusFilter, programFilter])

  const sortFn = useCallback((items: PhotoFrame[]) => {
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...items].sort((a, b) =>
      sort.key === 'name'
        ? mul * String(a.name).localeCompare(String(b.name), 'id-ID')
        : mul * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    )
  }, [sort])

  const { data, loading, error, page, totalItems, setPage, setSearch, refresh, adjustPageOnDelete } =
    useClientList<PhotoFrame>({
      fetchFn: () => frameService.getAll({ limit: 1000 }).then((r) => r.data),
      filterFn,
      sortFn,
      deps: [tenantId],
    })

  useEffect(() => {
    programService
      .getAll({ limit: 100 })
      .then((res) => setPrograms(res.data))
      .catch(() => setProgramError('Gagal memuat daftar program. Nama program mungkin tidak lengkap.'))
  }, [])

  const handleToggle = async (frame: PhotoFrame) => {
    try {
      if (frame.is_active) await frameService.deactivate(frame.id)
      else await frameService.activate(frame.id)
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await frameService.delete(deleteId)
      adjustPageOnDelete()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleteId(null)
    }
  }

  const columns: Column<PhotoFrame>[] = [
    {
      key: 'thumbnail',
      header: 'Thumbnail',
      render: (item: PhotoFrame) => (
        <button
          type="button"
          aria-label={'Pratinjau ' + item.name}
          className="cursor-zoom-in"
          onClick={() => setPreview(item)}
        >
          <img
            src={getMediaUrl('frame', item.id)}
            alt={item.name}
            onError={(e) => {
              ; (e.currentTarget as HTMLImageElement).src = IMAGE_FALLBACK_SRC
            }}
            className="h-12 w-12 rounded-lg bg-surface-container-high object-cover"
          />
        </button>
      ),
    },
    {
      key: 'name',
      header: 'Nama',
      sortable: true,
      render: (item: PhotoFrame) => <span className="font-medium text-on-surface">{item.name}</span>,
    },
    {
      key: 'program',
      header: 'Program',
      render: (item: PhotoFrame) => programMap.get(item.program_id ?? '') ?? 'Semua Program',
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (item: PhotoFrame) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>
          {item.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Dibuat',
      sortable: true,
      render: (item: PhotoFrame) => formatDate(item.created_at),
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item: PhotoFrame) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-4 h-4" />}
            tooltip="Edit"
            onClick={() => navigate('/admin/frames/' + item.id + '/edit')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={item.is_active ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
            tooltip={item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            onClick={() => handleToggle(item)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-error" />}
            tooltip="Hapus"
            onClick={() => setDeleteId(item.id)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Frame Manager"
        subtitle="Kelola frame PNG untuk Smart Photo."
        actions={
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.FRAME_UPLOAD)}>Upload Frame</Button>
        }
      />

      {programError && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="flex-1">{programError}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>Coba Lagi</Button>
        </div>
      )}

      <div
        role="group"
        aria-label="Filter status"
        className="flex w-fit gap-1 rounded-full bg-surface-container-low p-1"
      >
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            aria-pressed={statusFilter === filter.key}
            onClick={() => {
              setStatusFilter(filter.key)
              setPage(1)
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              statusFilter === filter.key
                ? 'bg-primary text-white'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <DataTable
        data={data}
        columns={columns}
        loading={loading}
        page={page}
        total={totalItems}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        onSort={(key, dir) => setSort({ key: key as 'name' | 'created_at', dir })}
        getRowId={(item: PhotoFrame) => item.id}
        actions={
          <Select
            aria-label="Program"
            value={programFilter}
            onChange={(e) => {
              setProgramFilter(e.target.value)
              setPage(1)
            }}
            className="w-56"
            options={[
              { value: 'all', label: 'Semua Program' },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        }
        emptyState={
          <ListEmptyState
            icon={<Image className="w-12 h-12" />}
            title="Belum ada frame"
            description="Klik 'Upload Frame' di atas untuk mengupload frame PNG pertama."
          />
        }
      />

      {preview && (
        <FramePreviewOverlay
          src={getMediaUrl('frame', preview.id)}
          alt={preview.name}
          onClose={() => setPreview(null)}
        />
      )}

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Hapus Frame" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus frame ini?</p>
      </Modal>
    </div>
  )
}

export default FramesPage
