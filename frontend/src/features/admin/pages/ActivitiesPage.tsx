import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Info, FolderOpen, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Select } from '../../../shared/components/ui/Select'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { programService } from '../../../core/services/programs'
import { programStageService } from '../../../core/services/program-stages'
import { programSubstageService } from '../../../core/services/program-substages'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import { activityNewPath, activityDetailPath, activityEditPath } from '../../../core/constants/app'
import { formatDate } from '../../../shared/utils'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Program, ProgramStage, ProgramSubstage } from '../../../core/types'

interface ActivityRow extends ProgramSubstage {
  programId: string
  programName: string
  stageName: string
}

const ActivitiesPage = () => {
  const navigate = useNavigate()
  const { tenantId } = useTenantScope()
  const { addToast } = useGlobalToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const programFilter = searchParams.get('programId') || ''
  const stageFilter = searchParams.get('stageId') || ''

  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(true)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [stagesLoading, setStagesLoading] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ActivityRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const {
    data: rows,
    loading,
    error,
    page,
    totalItems,
    setPage,
    setSearch,
    refresh,
    adjustPageOnDelete,
  } = useClientList<ActivityRow>({
    fetchFn: async () => {
      const params: { programId?: string; programStageId?: string; limit: number } = { limit: 1000 }
      if (programFilter) params.programId = programFilter
      if (stageFilter) params.programStageId = stageFilter
      const res = await programSubstageService.getAll(params)

      const [programsRes, stagesRes] = await Promise.all([
        programService.getAll({ limit: 1000 }),
        programStageService.getAll({ limit: 1000 }),
      ])
      const programMap: Record<string, Program> = {}
      programsRes.data.forEach((p) => { programMap[p.id] = p })
      const stageMap: Record<string, ProgramStage> = {}
      stagesRes.data.forEach((s) => { stageMap[s.id] = s })

      const enriched: ActivityRow[] = res.data
        .map((substage) => {
          const stage = stageMap[substage.program_stage_id]
          const program = stage ? programMap[stage.program_id] : undefined
          return {
            ...substage,
            programId: program?.id || '',
            programName: program?.name || '-',
            stageName: stage?.name || '-',
          }
        })
        .sort((a, b) => {
          if (a.programName !== b.programName) return a.programName.localeCompare(b.programName)
          if (a.stageName !== b.stageName) return a.stageName.localeCompare(b.stageName)
          return a.sequence_order - b.sequence_order
        })

      return enriched
    },
    filterFn: makeTextFilter(['name', 'description', 'programName', 'stageName']),
    deps: [tenantId, programFilter, stageFilter],
  })

  useEffect(() => {
    setProgramsLoading(true)
    programService
      .getAll({ limit: 1000 })
      .then((res) => setPrograms(res.data))
      .catch(() => setPrograms([]))
      .finally(() => setProgramsLoading(false))
  }, [tenantId])

  useEffect(() => {
    if (!programFilter) {
      setStages([])
      return
    }
    setStagesLoading(true)
    programStageService
      .getAll({ programId: programFilter, limit: 1000 })
      .then((res) => setStages(res.data))
      .catch(() => setStages([]))
      .finally(() => setStagesLoading(false))
  }, [programFilter])

  const programOptions = useMemo(
    () =>
      programs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.name })),
    [programs],
  )

  const stageOptions = useMemo(
    () =>
      stages
        .slice()
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((s) => ({ value: s.id, label: s.name })),
    [stages],
  )

  const handleProgramChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set('programId', value)
      else next.delete('programId')
      next.delete('stageId')
      return next
    })
  }

  const handleStageChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set('stageId', value)
      else next.delete('stageId')
      return next
    })
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await programSubstageService.remove(deleteTarget.id)
      addToast({ type: 'success', message: 'Kegiatan dihapus' })
      setDeleteTarget(null)
      adjustPageOnDelete()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<ActivityRow>[] = [
    {
      key: 'programName',
      header: 'Program',
      sortable: true,
      render: (item) => <span className="text-sm text-on-surface">{item.programName}</span>,
    },
    {
      key: 'stageName',
      header: 'Topik',
      sortable: true,
      render: (item) => <span className="text-sm text-on-surface">{item.stageName}</span>,
    },
    {
      key: 'name',
      header: 'Nama Kegiatan',
      sortable: true,
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.name}</p>
          <p className="text-sm text-on-surface-variant truncate max-w-xs">{item.description || '-'}</p>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Dibuat',
      render: (item) => <span className="text-sm text-on-surface-variant">{formatDate(item.created_at)}</span>,
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
            tooltip="Detail"
            onClick={() => navigate(activityDetailPath(item.id))}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-4 h-4" />}
            tooltip="Edit"
            onClick={() => navigate(activityEditPath(item.id))}
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

  const filterLoading = programsLoading || stagesLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kegiatan"
        subtitle="Kelola kegiatan (program substages) di dalam setiap topik."
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() =>
              navigate(activityNewPath({ programId: programFilter || undefined, stageId: stageFilter || undefined }))
            }
          >
            Tambah Kegiatan
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
        data={rows}
        columns={columns}
        loading={loading || filterLoading}
        page={page}
        total={totalItems}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item) => item.id}
        actions={
          <div className="flex items-center gap-2">
            <Select
              label="Program"
              placeholder="Semua Program"
              value={programFilter}
              options={[{ value: '', label: 'Semua Program' }, ...programOptions]}
              onChange={(e) => handleProgramChange(e.target.value)}
              className="w-56"
            />
            <Select
              label="Topik"
              placeholder={programFilter ? 'Semua Topik' : 'Pilih Program Dulu'}
              value={stageFilter}
              options={[{ value: '', label: 'Semua Topik' }, ...stageOptions]}
              onChange={(e) => handleStageChange(e.target.value)}
              disabled={!programFilter || stagesLoading}
              className="w-56"
            />
          </div>
        }
        emptyState={
          <EmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title="Belum ada kegiatan"
            description="Buat kegiatan pertama untuk program dan topik yang dipilih."
            action={{
              label: 'Tambah Kegiatan',
              onClick: () =>
                navigate(activityNewPath({ programId: programFilter || undefined, stageId: stageFilter || undefined })),
            }}
          />
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Kegiatan"
        message={`Yakin ingin menghapus kegiatan "${deleteTarget?.name || ''}"? Konten yang ditugaskan ke kegiatan ini akan dilepas. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default ActivitiesPage
