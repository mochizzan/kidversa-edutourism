import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES, imageFallbackSrc } from '../../../core/constants/app'
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
import { useTranslation } from 'react-i18next'

const frameTextFilter = makeTextFilter<PhotoFrame>(['name'])

const STATUS_FILTERS = [
  { key: 'all', labelKey: 'admin.common.all' },
  { key: 'active', labelKey: 'admin.status.active' },
  { key: 'inactive', labelKey: 'admin.status.inactive' },
] as const

const FramesPage = () => {
  const { t } = useTranslation()
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
      .catch(() => setProgramError(t('admin.frames.programLoadError')))
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
      header: t('admin.frames.colThumbnail'),
      render: (item: PhotoFrame) => (
        <button
          type="button"
          aria-label={t('admin.frames.previewAria', { name: item.name })}
          className="cursor-zoom-in"
          onClick={() => setPreview(item)}
        >
          <img
            src={getMediaUrl('frame', item.id)}
            alt={item.name}
            onError={(e) => {
              ; (e.currentTarget as HTMLImageElement).src = imageFallbackSrc()
            }}
            className="h-12 w-12 rounded-lg bg-surface-container-high object-cover"
          />
        </button>
      ),
    },
    {
      key: 'name',
      header: t('admin.col.name'),
      sortable: true,
      render: (item: PhotoFrame) => <span className="font-medium text-on-surface">{item.name}</span>,
    },
    {
      key: 'program',
      header: t('admin.col.program'),
      render: (item: PhotoFrame) => programMap.get(item.program_id ?? '') ?? t('admin.common.allPrograms'),
    },
    {
      key: 'is_active',
      header: t('admin.col.status'),
      render: (item: PhotoFrame) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>
          {item.is_active ? t('admin.status.active') : t('admin.status.inactive')}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('admin.col.created'),
      sortable: true,
      render: (item: PhotoFrame) => formatDate(item.created_at),
    },
    {
      key: 'actions',
      header: t('admin.col.action'),
      align: 'right',
      render: (item: PhotoFrame) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-4 h-4" />}
            tooltip={t('admin.common.edit')}
            onClick={() => navigate('/admin/frames/' + item.id + '/edit')}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={item.is_active ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
            tooltip={item.is_active ? t('admin.common.deactivate') : t('admin.common.activate')}
            onClick={() => handleToggle(item)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-error" />}
            tooltip={t('common.delete')}
            onClick={() => setDeleteId(item.id)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.sidebar.frames')}
        subtitle={t('admin.frames.subtitle')}
        actions={
          <Button icon={<Upload className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.FRAME_UPLOAD)}>{t('admin.frames.uploadTitle')}</Button>
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
          <Button variant="secondary" size="sm" onClick={refresh}>{t('common.error.retry')}</Button>
        </div>
      )}

      <div
        role="group"
        aria-label={t('admin.frames.filterStatusAria')}
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
            {t(filter.labelKey)}
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
            aria-label={t('admin.col.program')}
            value={programFilter}
            onChange={(e) => {
              setProgramFilter(e.target.value)
              setPage(1)
            }}
            className="w-56"
            options={[
              { value: 'all', label: t('admin.common.allPrograms') },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        }
        emptyState={
          <ListEmptyState
            icon={<Image className="w-12 h-12" />}
            title={t('admin.frames.emptyTitle')}
            description={t('admin.frames.emptyDescList')}
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

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('admin.frames.deleteTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={handleDelete}>{t('common.delete')}</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">{t('admin.frames.deleteMsg')}</p>
      </Modal>
    </div>
  )
}

export default FramesPage
