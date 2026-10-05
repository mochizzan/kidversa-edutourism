import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus,
  Pencil,
  Trash2,
  FolderOpen,
  AlertCircle,
  Info,
  PlusCircle,
  Layers,
  Award,
  AlertTriangle,
} from 'lucide-react'
import { ROUTES, programDetailPath, programEditPath, topicListPath, topicNewPath, topicDetailPath, topicEditPath } from '../../../core/constants/app'
import { withOrigin } from '../../../core/utils/navigation'
import { getMediaUrl } from '../../../core/utils/media'
import { Button } from '../../../shared/components/ui/Button'
import { StatusToggle } from '../../../shared/components/ui/StatusToggle'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { sessionService } from '../../../core/services/sessions'
import { ApiError } from '../../../core/services/backend-client'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import { useTranslation } from 'react-i18next'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Program, ProgramStage, Session } from '../../../core/types'
import { sessionStatusLabel } from '../../../core/utils/sessionStatus'
import { formatDate } from '../../../shared/utils'

interface ExpandedTopicsPanelProps {
  programId: string
}

function ExpandedTopicsPanel({ programId }: ExpandedTopicsPanelProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
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
              } catch (err) {
                console.warn('[ProgramsPage] listByStage failed', err)
                countsMap[stage.id] = 0
              }
            }),
          )
          if (!cancelled) setCounts(countsMap)
        } catch (err) {
          console.error('[ProgramsPage] getStages failed', err)
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
    } catch (err) {
      // swallow
      console.error('[ProgramsPage] deleteStage failed', err)
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-on-surface">{t('admin.programs.panelTitle')}</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<PlusCircle className="w-4 h-4" />}
            onClick={() =>
              navigate(withOrigin(topicNewPath({ programId }), `${location.pathname}${location.search}`))
            }
          >
            {t('admin.topic.add')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Layers className="w-4 h-4" />}
            onClick={() => navigate(topicListPath({ programId }))}
          >
            {t('admin.topic.viewAll')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-on-surface-variant">{t('admin.programs.panelLoading')}</div>
      ) : stages.length === 0 ? (
        <div className="text-sm text-on-surface-variant">{t('admin.programs.panelEmpty')}</div>
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
                    src={getMediaUrl('content', stage.badge_image_url)}
                    alt={stage.badge_name || t('admin.programs.badgeAlt')}
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
                    {stage.badge_name
                      ? t('admin.programs.badgeLine', { name: stage.badge_name })
                      : stage.badge_image_url
                        ? t('admin.topic.badgeTitle')
                        : t('admin.programs.noBadge')}
                    {' · '}
                    {t('admin.programs.activityCount', { count: counts[stage.id] ?? 0 })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Info className="w-4 h-4" />}
                  tooltip={t('admin.common.detail')}
                  onClick={() => navigate(topicDetailPath(stage.id))}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Pencil className="w-4 h-4" />}
                  tooltip={t('admin.common.edit')}
                  onClick={() =>
                    navigate(withOrigin(topicEditPath(stage.id), `${location.pathname}${location.search}`))
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="w-4 h-4 text-error" />}
                  tooltip={t('common.delete')}
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
        title={t('admin.topic.deleteTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteStage(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleDeleteStage}>{t('common.delete')}</Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          {t('admin.topic.deleteMsgPanel', { name: deleteStage?.name ?? '' })}
        </p>
      </Modal>
    </div>
  )
}

const ProgramsPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { tenantId } = useTenantScope()
  const { addToast } = useGlobalToast()
  const { data: programs, loading, error, page, totalItems, setPage, setSearch, refresh } = useClientList<Program>({
    fetchFn: () => programService.getAll({ limit: 1000 }).then((r) => r.data),
    filterFn: makeTextFilter(['name', 'description']),
    deps: [tenantId],
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // Set after a non-force DELETE answers 409 program_has_sessions: the modal
  // switches to the FULL force-confirmation mode listing the affected sessions
  // (fetched via GET /api/sessions?program_id=). null = light confirm mode.
  const [blockedSessions, setBlockedSessions] = useState<Session[] | null>(null)
  const [blockedTotal, setBlockedTotal] = useState(0)
  const [forceConfirmed, setForceConfirmed] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { getHighlightClass } = useHighlight()

  const handleToggle = async (id: string) => {
    await programService.toggleActive(id)
    refresh()
  }

  const resetDelete = () => {
    setDeleteId(null)
    setBlockedSessions(null)
    setBlockedTotal(0)
    setForceConfirmed(false)
  }

  // Light-confirm step: DELETE without force. A 409 program_has_sessions
  // escalates to the full modal (count + session list + hard warning +
  // checkbox) instead of failing — everything else surfaces as an error toast.
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await programService.delete(deleteId)
      addToast({ type: 'success', message: t('admin.programs.deletedToast') })
      resetDelete()
      refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'program_has_sessions') {
        try {
          const res = await sessionService.getAll({
            limit: 1000,
            filters: { program_id: deleteId },
          })
          setBlockedSessions(res.data)
          setBlockedTotal(res.total)
        } catch (listErr) {
          // The force modal must still open (count unknown → list-derived).
          console.error('[ProgramsPage] load affected sessions failed', listErr)
          setBlockedSessions([])
          setBlockedTotal(0)
        }
        setForceConfirmed(false)
      } else {
        addToast({ type: 'error', message: friendlyError(err) })
        resetDelete()
      }
    } finally {
      setDeleting(false)
    }
  }

  // Force step: DELETE ?force=true — hard-deletes program + sessions + children.
  const handleForceDelete = async () => {
    if (!deleteId || !forceConfirmed) return
    setDeleting(true)
    try {
      await programService.delete(deleteId, { force: true })
      addToast({ type: 'success', message: t('admin.programs.deletedToast') })
      resetDelete()
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  const columns: Column<Program>[] = [
    {
      key: 'name',
      header: t('admin.col.programName'),
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
      header: t('admin.col.status'),
      render: (item: Program) => (
        <Badge variant={item.is_active ? 'success' : 'neutral'}>{item.is_active ? t('admin.status.active') : t('admin.status.inactive')}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: t('admin.col.created'),
      render: (item: Program) => formatDate(item.created_at),
    },
    {
      key: 'actions',
      header: t('admin.col.action'),
      align: 'right',
      render: (item: Program) => (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" icon={<Info className="w-4 h-4" />} tooltip={t('admin.common.detail')} onClick={() => navigate(programDetailPath(item.id))} />
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil className="w-4 h-4" />}
            tooltip={t('admin.common.edit')}
            onClick={() =>
              navigate(withOrigin(programEditPath(item.id), `${location.pathname}${location.search}`))
            }
          />
          <StatusToggle isActive={item.is_active} onClick={() => handleToggle(item.id)} />
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip={t('common.delete')} onClick={() => setDeleteId(item.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.programs.pageTitle')}
        subtitle={t('admin.programs.pageSubtitle')}
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate(withOrigin(ROUTES.ADMIN.PROGRAM_NEW, `${location.pathname}${location.search}`))}
          >{t('admin.programs.add')}</Button>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>{t('common.error.retry')}</Button>
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
          <ListEmptyState
            icon={<FolderOpen className="w-12 h-12" />}
            title={t('admin.programs.emptyTitle')}
            description={t('admin.programs.emptyDesc')}
          />
        }
      />

      {/* Light confirm: shown when no 409 was seen yet (no sessions, or the
          user has not confirmed once). DELETE runs without force. */}
      <Modal open={!!deleteId && blockedSessions === null} onClose={resetDelete} title={t('admin.programs.deleteTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={resetDelete}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>{t('common.delete')}</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">{t('admin.programs.deleteMsg')}</p>
      </Modal>

      {/* Full force confirm (409 program_has_sessions): affected-session count
          + list, hard permanent-deletion warning, mandatory checkbox before
          the force button unlocks. */}
      <Modal
        open={!!deleteId && blockedSessions !== null}
        onClose={resetDelete}
        title={t('admin.programs.deleteForceTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resetDelete} disabled={deleting}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleForceDelete} disabled={!forceConfirmed} loading={deleting}>
              {t('admin.programs.deleteForceConfirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface">
            {t('admin.programs.deleteForceCount', { count: blockedTotal })}
          </p>

          {blockedSessions && blockedSessions.length > 0 && (
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3">
              <p className="text-xs font-medium text-on-surface-variant mb-2">
                {t('admin.programs.deleteForceListLabel')}
              </p>
              <ul className="space-y-1">
                {blockedSessions.slice(0, 5).map((s) => (
                  <li key={s.id} className="text-sm text-on-surface flex items-center justify-between gap-3">
                    <span className="truncate">{s.name}</span>
                    <Badge variant="neutral" size="sm">{sessionStatusLabel(s.status)}</Badge>
                  </li>
                ))}
              </ul>
              {blockedTotal > 5 && (
                <p className="text-xs text-on-surface-variant mt-2">
                  {t('admin.programs.deleteForceMore', { count: blockedTotal - 5 })}
                </p>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-error-container/40 text-on-error-container p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{t('admin.programs.deleteForceWarning')}</p>
          </div>

          <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forceConfirmed}
              onChange={(e) => setForceConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-error cursor-pointer"
            />
            <span>{t('admin.programs.deleteForceCheckbox')}</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}

export default ProgramsPage
