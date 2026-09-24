import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programStageService } from '../../../core/services/program-stages'
import { programSubstageService } from '../../../core/services/program-substages'
import { activityListPath, activityNewPath, activityDetailPath } from '../../../core/constants/app'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage, ProgramSubstage } from '../../../core/types'
import { useTranslation } from 'react-i18next'

const ActivityFormPage = () => {
  const { t } = useTranslation()
  const { activityId } = useParams<{ activityId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useGlobalToast()

  const isNew = !activityId || activityId === 'new'
  const queryProgramId = searchParams.get('programId') || ''
  const queryStageId = searchParams.get('stageId') || ''

  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(true)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [stagesLoading, setStagesLoading] = useState(false)
  const [activity, setActivity] = useState<ProgramSubstage | null>(null)
  const [loading, setLoading] = useState(!isNew)

  const [programId, setProgramId] = useState(queryProgramId)
  const [stageId, setStageId] = useState(queryStageId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProgramsLoading(true)
    programService
      .getAll({ limit: 1000 })
      .then((res) => setPrograms(res.data))
      .catch(() => setPrograms([]))
      .finally(() => setProgramsLoading(false))
  }, [])

  useEffect(() => {
    if (!programId) {
      setStages([])
      return
    }
    setStagesLoading(true)
    programStageService
      .getAll({ programId, limit: 1000 })
      .then((res) => setStages(res.data))
      .catch(() => setStages([]))
      .finally(() => setStagesLoading(false))
  }, [programId])

  useEffect(() => {
    if (isNew || !activityId) {
      setLoading(false)
      return
    }
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
          setName(found.name)
          setDescription(found.description || '')
          setStageId(found.program_stage_id)

          const stageList = await programStageService.getAll({ limit: 1000 })
          const parent = stageList.data.find((s) => s.id === found.program_stage_id)
          if (parent) {
            setProgramId(parent.program_id)
          }
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
        }
      })()
  }, [isNew, activityId, addToast, navigate])

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

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === programId) || null,
    [programs, programId],
  )

  const handleProgramChange = (value: string) => {
    setProgramId(value)
    setStageId('')
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!programId) {
      addToast({ type: 'error', message: t('admin.topic.programRequired') })
      return
    }
    if (!stageId) {
      addToast({ type: 'error', message: t('admin.activities.stageRequired') })
      return
    }
    if (!name.trim()) {
      addToast({ type: 'error', message: t('admin.activities.nameRequired') })
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const existing = await programSubstageService.listByStage(stageId)
        const created = await programSubstageService.create({
          program_stage_id: stageId,
          sequence_order: existing.length + 1,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        addToast({ type: 'success', message: t('admin.activities.createdToast') })
        navigate(activityDetailPath(created.id))
      } else if (activityId) {
        const updated = await programSubstageService.update(activityId, {
          program_stage_id: stageId,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        addToast({ type: 'success', message: t('admin.activities.updatedToast') })
        navigate(activityDetailPath(updated.id))
      }
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (isNew) {
      navigate(activityNewPath({ programId: queryProgramId || undefined, stageId: queryStageId || undefined }))
      return
    }
    navigate(activityDetailPath(activityId!))
  }

  if (loading || programsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isNew && !activity) {
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
        title={isNew ? t('admin.activities.newTitle') : t('admin.activities.editTitle', { name: activity?.name ?? '' })}
        subtitle={selectedProgram ? `Program: ${selectedProgram.name}` : t('admin.activities.pickFirst')}
        breadcrumbs={[
          { label: t('admin.activities.title'), href: activityListPath() },
          { label: isNew ? t('admin.common.createNew') : activity?.name || t('admin.common.edit') },
        ]}
      />

      <Card>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Select
            label={t('admin.col.program')}
            placeholder={t('admin.topic.pickProgram')}
            value={programId}
            options={programOptions}
            onChange={(e) => handleProgramChange(e.target.value)}
            required
            disabled={programsLoading}
          />

          <Select
            label={t('admin.topic.pageTitle')}
            placeholder={programId ? t('admin.activities.pickTopic') : t('admin.activities.pickProgramDulu')}
            value={stageId}
            options={stageOptions}
            onChange={(e) => setStageId(e.target.value)}
            required
            disabled={!programId || stagesLoading}
          />

          <Input
            label={t('admin.activities.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('admin.activities.namePlaceholder')}
            required
          />

          <Input
            label={t('admin.activities.descLabel')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('admin.activities.descPlaceholder')}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={handleCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default ActivityFormPage
