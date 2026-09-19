import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Select } from '../../../shared/components/ui/Select'
import { DataTable } from '../../../shared/components/data/DataTable'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import { topicNewPath, topicDetailPath, topicEditPath } from '../../../core/constants/app'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Column } from '../../../shared/components/data/DataTable'
import type { ProgramStage, ProgramSubstage } from '../../../core/types'

interface TopicRow extends ProgramStage {
  programId: string
  programName: string
}

function CountCell({ stageId }: { stageId: string }) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useMemo(() => {
    let cancelled = false
    setLoading(true)
    programSubstageService
      .listByStage(stageId)
      .then((list) => {
        if (!cancelled) setCount(list.length)
      })
      .catch(() => {
        if (!cancelled) setCount(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stageId])

  if (loading || count === null) return <span className="text-on-surface-variant">-</span>
  return <span>{count}</span>
}

function ActivityPreview({ stageId }: { stageId: string }) {
  const [items, setItems] = useState<ProgramSubstage[]>([])
  const [loading, setLoading] = useState(true)

  useMemo(() => {
    let cancelled = false
    setLoading(true)
    programSubstageService
      .listByStage(stageId)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [stageId])

  if (loading) return <p className="text-xs text-on-surface-variant py-2">Memuat kegiatan…</p>
  if (items.length === 0)
    return <p className="text-xs text-on-surface-variant py-2">Belum ada kegiatan.</p>

  return (
    <ul className="space-y-1 py-2">
      {items.map((item, idx) => (
        <li key={item.id} className="text-sm text-on-surface">
          {idx + 1}. {item.name}
        </li>
      ))}
    </ul>
  )
}

const TopicsPage = () => {
  const navigate = useNavigate()
  const { tenantId } = useTenantScope()
  const { addToast } = useGlobalToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const programFilter = searchParams.get('programId') || ''

  const [deleteTarget, setDeleteTarget] = useState<TopicRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    data: rows,
    allData,
    loading,
    error,
    page,
    setPage,
    setSearch,
    refresh,
  } = useClientList<TopicRow>({
    fetchFn: async () => {
      const res = await programService.getAll({ limit: 1000 })
      const programs = res.data
      const rows: TopicRow[] = []
      await Promise.all(
        programs.map(async (program) => {
          const stages = await programService.getStages(program.id)
          stages.forEach((stage) => {
            rows.push({
              ...stage,
              programId: program.id,
              programName: program.name,
            })
          })
        }),
      )
      rows.sort((a, b) => {
        if (a.programName !== b.programName) return a.programName.localeCompare(b.programName)
        return a.sequence_order - b.sequence_order
      })
      return rows
    },
    filterFn: makeTextFilter(['programName', 'name', 'description', 'badge_name']),
    deps: [tenantId],
  })

  const programs = useMemo(() => {
    const map = new Map<string, string>()
    allData.forEach((row) => map.set(row.programId, row.programName))
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allData])

  const filteredRows = useMemo(() => {
    if (!programFilter) return rows
    return rows.filter((row) => row.programId === programFilter)
  }, [rows, programFilter])

  const columns: Column<TopicRow>[] = [
    {
      key: 'programName',
      header: 'Program',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.programName}</p>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Nama Topik',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.name}</p>
          <p className="text-sm text-on-surface-variant truncate max-w-xs">
            {item.description || '-'}
          </p>
        </div>
      ),
    },
    {
      key: 'badge',
      header: 'Badge',
      render: (item) =>
        item.badge_name ? (
          <Badge variant="accent">{item.badge_name}</Badge>
        ) : (
          <span className="text-sm text-on-surface-variant">-</span>
        ),
    },
    {
      key: 'kegiatan_count',
      header: 'Jumlah Kegiatan',
      render: (item) => <CountCell stageId={item.id} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<Info className="w-4 h-4" />}
            tooltip="Info"
            onClick={() => navigate(topicDetailPath(item.id))}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-4 h-4" />}
            tooltip="Edit"
            onClick={() => navigate(topicEditPath(item.id))}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-error" />}
            tooltip="Hapus"
            onClick={() => setDeleteTarget(item)}
          />
        </div>
      ),
    },
  ]

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await programService.deleteStage(deleteTarget.programId, deleteTarget.id)
      addToast({ type: 'success', message: 'Topik dihapus' })
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Topik"
        subtitle="Kelola topik (subtopik) dan kegiatan di dalam program."
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate(topicNewPath({ programId: programFilter || undefined }))}
          >
            Tambah Topik
          </Button>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <Button variant="secondary" size="sm" onClick={refresh}>
            Coba Lagi
          </Button>
        </div>
      )}

      <DataTable
        data={filteredRows}
        columns={columns}
        loading={loading}
        page={page}
        total={filteredRows.length}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item) => item.id}
        expandedRowRender={(item: TopicRow) => (
          <div className="p-4 border-t border-outline-variant/50">
            <ActivityPreview stageId={item.id} />
          </div>
        )}
        actions={
          <Select
            label="Program"
            placeholder="Semua Program"
            value={programFilter}
            options={[{ value: '', label: 'Semua Program' }, ...programs]}
            onChange={(e) => {
              const value = e.target.value
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (value) next.set('programId', value)
                else next.delete('programId')
                return next
              })
            }}
            className="w-56"
          />
        }
        emptyState={
          <ListEmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title="Belum ada topik"
            description="Buat topik pertama untuk program yang dipilih."
          />
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Topik"
        message={`Yakin ingin menghapus topik "${deleteTarget?.name || ''}"? Seluruh kegiatan di dalamnya juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Topik"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default TopicsPage
