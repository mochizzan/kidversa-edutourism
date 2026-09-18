import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  FolderOpen,
  AlertCircle,
  Eye,
  PlusCircle,
  Layers,
  Award,
} from 'lucide-react'
import { ROUTES, programDetailPath, topicListPath, topicNewPath, topicDetailPath, topicEditPath } from '../../../core/constants/app'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Program, ProgramStage } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

interface ExpandedTopicsPanelProps {
  programId: string
}

function ExpandedTopicsPanel({ programId }: ExpandedTopicsPanelProps) {
  const navigate = useNavigate()
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [deleteStage, setDeleteStage] = useState<ProgramStage | null>(null)

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        setLoading(true)
        try {
          const list = await programService.getStages(programId)
          if (cancelled) return
          setStages(list)
          const countsMap: Record<string, number> = {}
          await Promise.all(
            list.map(async (stage) => {
              try {
                const substages = await programSubstageService.listByStage(stage.id)
                countsMap[stage.id] = substages.length
              } catch {
                countsMap[stage.id] = 0
              }
            }),
          )
          if (!cancelled) setCounts(countsMap)
        } catch {
          if (!cancelled) setStages([])
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => { cancelled = true }
  }, [programId])

  const handleDeleteStage = async () => {
    if (!deleteStage) return
    try {
      await programService.deleteStage(programId, deleteStage.id)
      setStages((prev) => prev.filter((s) => s.id !== deleteStage.id))
      setCounts((prev) => {
        const next = { ...prev }
        delete next[deleteStage.id]
        return next
      })
      setDeleteStage(null)
    } catch {
      // swallow
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-on-surface">Topik dalam Program</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={() => navigate(topicNewPath({ programId }))}
          >
            Tambah Topik
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Layers className="w-4 h-4" />}
            onClick={() => navigate(topicListPath({ programId }))}
          >
            Lihat Semua Topik
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-on-surface-variant">Memuat topik…</div>
      ) : stages.length === 0 ? (
        <div className="text-sm text-on-surface-variant">Belum ada topik dalam program ini.</div>
      ) : (
        <div className="space-y-3">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className="flex items-center justify-between p-3 rounded-xl border border-outline-variant bg-surface"
            >
              <div className="flex items-center gap-3 min-w-0">
                {stage.badge_image_url ? (
                  <img
                    src={stage.badge_image_url}
                    alt={stage.badge_name || 'badge'}
                    className="h-10 w-10 rounded-full object-cover border border-outline-variant"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-surface-container-high grid place-items-center border border-outline-variant">
                    <Award className="h-5 w-5 text-on-surface-variant/60" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-on-surface truncate">{stage.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {stage.badge_name ? `Badge: ${stage.badge_name}` : 'Tanpa badge'}
                    {' · '}
                    {stage.is_photo_stage ? 'Foto-stage' : 'Bukan foto-stage'}
                    {' · '}
                    {counts[stage.id] ?? 0} Kegiatan
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Eye className="w-4 h-4" />}
                  tooltip="Info"
                  onClick={() => navigate(topicDetailPath(stage.id))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="w-4 h-4" />}
                  tooltip="Edit"
                  onClick={() => navigate(topicEditPath(stage.id))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4 text-error" />}
                  tooltip="Hapus"
                  onClick={() => setDeleteStage(stage)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!deleteStage}
        onClose={() => setDeleteStage(null)}
        title="Hapus Topik"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteStage(null)}>Batal</Button>
            <Button variant="danger" onClick={handleDeleteStage}>Hapus</Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin menghapus topik “{deleteStage?.name}”? Seluruh kegiatan di dalamnya juga akan dihapus.
        </p>
      </Modal>
    </div>
  )
}

const ProgramsPage = () => {
  const navigate = useNavigate()
  const { tenantId } = useTenantScope()
  const { data: programs, loading, error, page, totalItems, setPage, setSearch, refresh } = useClientList<Program>({
    fetchFn: () => programService.getAll({ limit: 1000 }).then((r) => r.data),
    filterFn: makeTextFilter(['name', 'description']),
    deps: [tenantId],
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
          <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit" onClick={() => navigate(programDetailPath(item.id))} />
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
        subtitle="Kelola program edutourism dan topik di dalamnya."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.PROGRAM_NEW)}>Buat Program</Button>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>Coba Lagi</Button>
        </div>
      )}

      <DataTable
        data={programs}
        columns={columns}
        loading={loading}
        page={page}
        total={totalItems}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: Program) => item.id}
        rowClassName={(item: Program) => getHighlightClass(item.id)}
        expandedRowRender={(item: Program) => <ExpandedTopicsPanel programId={item.id} />}
        emptyState={
          <EmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title="Belum ada program"
            description="Buat program pertama untuk memulai."
            action={{ label: 'Buat Program', onClick: () => navigate(ROUTES.ADMIN.PROGRAM_NEW) }}
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
