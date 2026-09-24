import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Eye, Plus, AlertCircle } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { DataTable, type Column } from '../../../shared/components/data/DataTable'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { Modal } from '../../../shared/components/ui/Modal'
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { Assessment, Participant, Session } from '../../../core/types'
import { SessionStatus } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'
import { ROUTES } from '../../../core/constants/app'
import { i18n } from '../../../core/i18n'
import { useTranslation } from 'react-i18next'

interface ParticipantRow extends Participant {
  sessionName: string
  statusLabel: string
  assessedCount: number
}

const getSessionStatusLabel = (session?: Session | null) => {
  if (!session) return i18n.t('admin.participants.sessionMissing')
  if (session.status === SessionStatus.DRAFT) return i18n.t('admin.participants.waitingSession')
  if (session.status === SessionStatus.ACTIVE) return i18n.t('admin.participants.inSession')
  if (session.status === SessionStatus.COMPLETED) return i18n.t('admin.participants.sessionDone')
  return i18n.t('admin.participants.notInSession')
}

const ParticipantsPage = () => {
  const { t } = useTranslation()
  const { addToast } = useGlobalToast()
  const { tenantId } = useTenantScope()
  const {
    data: participants,
    loading,
    error,
    page,
    totalItems,
    setPage,
    setSearch,
    refresh,
    adjustPageOnDelete,
  } = useClientList<Participant>({
    fetchFn: () => participantService.getAll({ limit: 1000 }).then((r) => r.data),
    filterFn: makeTextFilter(['child_name', 'parent_name', 'school_name']),
    deps: [tenantId],
  })
  const [sessionsById, setSessionsById] = useState<Record<string, Session>>({})
  const [assessmentsByParticipant, setAssessmentsByParticipant] = useState<Record<string, Assessment[]>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadSessions = async () => {
      try {
        const sessionsRes = await sessionService.getAll({ limit: 100 })
        if (cancelled) return

        const sessionMap = sessionsRes.data.reduce<Record<string, Session>>((acc, session) => {
          acc[session.id] = session
          return acc
        }, {})

        setSessionsById(sessionMap)
      } catch (err) {
        if (!cancelled) {
          addToast({ type: 'error', message: friendlyError(err) })
        }
      }
    }

    void loadSessions()

    return () => {
      cancelled = true
    }
  }, [addToast, tenantId])

  useEffect(() => {
    let cancelled = false

    const loadAssessments = async () => {
      if (participants.length === 0) return

      const results: Record<string, Assessment[]> = {}
      await Promise.all(
        participants.map(async (p) => {
          const assessments = await assessmentService.getByParticipant(p.id)
          results[p.id] = assessments
        })
      )

      if (!cancelled) {
        setAssessmentsByParticipant(results)
      }
    }

    void loadAssessments()
    return () => {
      cancelled = true
    }
  }, [participants, tenantId])

  const rows = useMemo<ParticipantRow[]>(() => {
    return participants.map((participant) => {
      const session = participant.session_id ? sessionsById[participant.session_id] : undefined
      const participantAssessments = assessmentsByParticipant[participant.id] ?? []

      let statusLabel = t('admin.participants.notInSession')
      if (participant.session_id) {
        statusLabel = getSessionStatusLabel(session)
      }

      return {
        ...participant,
        sessionName: session?.name ?? t('admin.participants.notInSession'),
        statusLabel,
        assessedCount: participantAssessments.length,
      }
    })
  }, [participants, sessionsById, assessmentsByParticipant, t])

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      // Global participant deletes are not exposed by the backend; the
      // participant must be removed from its session instead.
      const target = participants.find((p) => p.id === deleteId)
      if (!target?.session_id) {
        addToast({ type: 'error', message: t('admin.participants.noSessionDelete') })
        setDeleteId(null)
        return
      }
      await sessionService.removeParticipant(target.session_id, deleteId)
      addToast({ type: 'success', message: t('admin.participants.deletedToast') })
      setDeleteId(null)
      adjustPageOnDelete()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    }
  }

  const columns: Column<ParticipantRow>[] = [
    {
      key: 'child_name',
      header: t('admin.col.participantName'),
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.child_name}</p>
          <p className="text-xs text-on-surface-variant">{t('admin.participants.ageLine', { age: item.child_age })}{item.school_name ? ` · ${item.school_name}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'parent_name',
      header: t('admin.participants.parentCol'),
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.parent_name}</p>
          <p className="text-xs text-on-surface-variant">{item.parent_phone}{item.parent_email ? ` · ${item.parent_email}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'sessionName',
      header: t('admin.col.session'),
      render: (item) => <span>{item.sessionName}</span>,
    },
    {
      key: 'statusLabel',
      header: t('admin.col.status'),
      render: (item) => <Badge variant={item.session_id ? 'primary' : 'neutral'}>{item.statusLabel}</Badge>,
    },
    {
      key: 'assessedCount',
      header: t('admin.col.assessed'),
      render: (item) => {
        if (!item.session_id) {
          return <Badge variant="neutral">{t('admin.participants.notInSession')}</Badge>
        }
        if (item.assessedCount > 0) {
          return <Badge variant="success">{t('admin.participants.assessedCount', { count: item.assessedCount })}</Badge>
        }
        return <Badge variant="warning">{t('admin.participants.notAssessed')}</Badge>
      },
    },
    {
      key: 'actions',
      header: t('admin.col.action'),
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`${ROUTES.ADMIN.PARTICIPANTS}/${item.id}`}>
            <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} tooltip={t('admin.participants.viewDetail')} />
          </Link>
          <Link to={`${ROUTES.ADMIN.PARTICIPANTS}/${item.id}/edit`}>
            <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip={t('admin.participants.edit')} />
          </Link>
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip={t('admin.participants.deleteBtn')} onClick={() => setDeleteId(item.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.sidebar.participants')}
        subtitle={t('admin.participants.subtitle')}
        actions={
          <Link to={`${ROUTES.ADMIN.PARTICIPANTS}/new`}>
            <Button icon={<Plus className="w-4 h-4" />}>{t('admin.participants.add')}</Button>
          </Link>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>{t('common.error.retry')}</Button>
        </div>
      )}

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        page={page}
        total={totalItems}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item) => item.id}
        ariaLabel={t('admin.participants.listAria')}
        emptyState={<ListEmptyState title={t('admin.participants.emptyTitle')} description={t('admin.participants.emptyDesc')} />}
      />

      <Modal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title={t('admin.participants.deleteTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          {t('admin.participants.deleteMsg')}
        </p>
      </Modal>
    </div>
  )
}

export default ParticipantsPage
