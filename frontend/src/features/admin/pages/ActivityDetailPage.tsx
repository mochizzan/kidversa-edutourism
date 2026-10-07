import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programStageService } from '../../../core/services/program-stages'
import { programSubstageService } from '../../../core/services/program-substages'
import {
  activityListPath,
  activityEditPath,
} from '../../../core/constants/app'
import { withOrigin } from '../../../core/utils/navigation'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage, ProgramSubstage } from '../../../core/types'
import { useTranslation } from 'react-i18next'

const ActivityDetailPage = () => {
  const { t } = useTranslation()
  const { activityId } = useParams<{ activityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToast } = useGlobalToast()

  const [activity, setActivity] = useState<ProgramSubstage | null>(null)
  const [stage, setStage] = useState<ProgramStage | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!activityId) return
    setLoading(true)
      ; (async () => {
        try {
          const found = await programSubstageService.getById(activityId)
          if (!found) {
            addToast({ type: 'error', message: t('admin.activities.notFound') })
            navigate(activityListPath())
            return
          }
          setActivity(found)

          const stageList = await programStageService.getAll({ limit: 1000 })
          const parent = stageList.data.find((s) => s.id === found.program_stage_id)
          if (parent) {
            setStage(parent)
            const programs = await programService.getAll({ limit: 1000 })
            const prog = programs.data.find((p) => p.id === parent.program_id)
            if (prog) setProgram(prog)
          }
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
        }
      })()
  }, [activityId, addToast, navigate])

  const handleDelete = async () => {
    if (!activity) return
    setDeleting(true)
    try {
      await programSubstageService.remove(activity.id)
      addToast({ type: 'success', message: t('admin.activities.deletedToast') })
      setDeleteOpen(false)
      navigate(activityListPath())
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="text-center text-on-surface-variant py-12">
        {t('admin.activities.notFound')}
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate(activityListPath())}>
            {t('common.back')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={activity.name}
        subtitle={t('admin.activities.detailSubtitle', { program: program?.name || '-', topic: stage?.name || '-' })}
        breadcrumbs={[
          { label: t('admin.activities.title'), href: activityListPath() },
          { label: activity.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Pencil className="w-4 h-4" />}
              onClick={() =>
                navigate(withOrigin(activityEditPath(activity.id), `${location.pathname}${location.search}`))
              }
            >
              {t('admin.common.edit')}
            </Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setDeleteOpen(true)}>
              {t('common.delete')}
            </Button>
          </div>
        }
      />

      <Card title={t('admin.common.detail')}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.col.program')}</p>
            <p className="text-sm text-on-surface">{program?.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.topic.pageTitle')}</p>
            <p className="text-sm text-on-surface">{stage?.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.activities.nameLabel')}</p>
            <p className="text-sm text-on-surface">{activity.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{t('admin.activities.descLabel')}</p>
            <p className="text-sm text-on-surface">{activity.description || '-'}</p>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title={t('admin.activities.deleteTitle')}
        message={t('admin.activities.deleteMsgDetail', { name: activity.name })}
        confirmLabel={t('common.delete')}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  )
}

export default ActivityDetailPage
