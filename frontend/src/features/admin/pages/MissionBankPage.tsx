import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Pencil, Power, PowerOff, Trash2, FileText } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { DataTable } from '../../../shared/components/data/DataTable'
import type { Column } from '../../../shared/components/data/DataTable'
import { useMissionBank } from '../hooks/useMissionBank'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { MissionBank } from '../../../core/types'
import { useTranslation } from 'react-i18next'

const MissionBankPage = () => {
  const { t } = useTranslation()
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

  const currentAction = deactivateTarget?.is_active ? t('admin.common.deactivate') : t('admin.common.activate')

  const columns: Column<MissionBank>[] = [
    {
      key: 'title',
      header: t('admin.missions.title'),
      sortable: true,
      render: (item) => (
        <span className="font-medium text-on-surface">{item.title}</span>
      ),
    },
    {
      key: 'program_id',
      header: t('admin.col.program'),
      render: (item) => (
        <span className="text-sm text-on-surface-variant">
          {programMap.get(item.program_id) || '-'}
        </span>
      ),
    },
    {
      key: 'related_stage_ids',
      header: t('admin.missions.relatedStages'),
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
      header: t('admin.col.status'),
      render: (item) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>
          {item.is_active ? t('admin.status.active') : t('admin.status.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('admin.col.action'),
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-1">
          <Link to={`/admin/missions/${item.id}/edit`}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Pencil className="w-4 h-4" />}
              tooltip={t('admin.common.edit')}
            />
          </Link>
          {item.is_active ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<PowerOff className="w-4 h-4 text-warning" />}
              tooltip={t('admin.common.deactivate')}
              onClick={() => handleToggleActive(item)}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Power className="w-4 h-4 text-green-600" />}
              tooltip={t('admin.common.activate')}
              onClick={() => setDeactivateTarget(item)}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4 text-error" />}
            tooltip={t('common.delete')}
            onClick={() => handleDelete(item)}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.missions.bankTitle')}
        subtitle={t('admin.missions.bankSubtitle')}
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate(ROUTES.ADMIN.MISSION_NEW)}
          >
            {t('admin.missions.new')}
          </Button>
        }
      />

      {error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadMissions}>
            {t('common.error.retry')}
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
                  { value: '', label: t('admin.common.allPrograms') },
                  ...programs.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={selectedProgram}
                onChange={(e) => setSelectedProgram(e.target.value)}
                placeholder={t('admin.common.allPrograms')}
              />
            </div>
          </div>
        }
        emptyState={
          <ListEmptyState
            icon={<FileText className="w-12 h-12" />}
            title={t('admin.missions.emptyTitle')}
            description={
              selectedProgram
                ? t('admin.missions.emptyFiltered')
                : t('admin.missions.emptyAll')
            }
          />
        }
      />

      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title={t('admin.missions.toggleTitle', { action: currentAction })}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>
              {t('common.cancel')}
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
          {t('admin.missions.toggleMsg', { action: currentAction.toLowerCase(), title: deactivateTarget?.title ?? '' })}
        </p>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('admin.missions.deleteTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={deleting}
            >
              {t('common.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          {t('admin.missions.deleteMsg', { title: deleteTarget?.title ?? '' })}
        </p>
      </Modal>
    </div>
  )
}

export default MissionBankPage
