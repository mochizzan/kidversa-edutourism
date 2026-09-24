import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage } from '../../../core/types'
import { cn } from '../../../core/utils'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useTranslation } from 'react-i18next'

const MissionFormPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { missionId } = useParams()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(missionId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [programs, setPrograms] = useState<Program[]>([])
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [selectedStages, setSelectedStages] = useState<string[]>([])

  const [form, setForm] = useState({
    program_id: '',
    title: '',
  })

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  useEffect(() => {
    if (isEdit && missionId) {
      missionService.getById(missionId).then((mission) => {
        if (mission) {
          setForm({
            program_id: mission.program_id,
            title: mission.title,
          })
          setSelectedStages(mission.related_stage_ids || [])
          programService.getStages(mission.program_id).then(setStages)
        }
        setLoading(false)
      })
    }
  }, [isEdit, missionId])

  const loadStages = useCallback(async (programId: string) => {
    if (!programId) {
      setStages([])
      return
    }
    const res = await programService.getStages(programId)
    setStages(res)
    setSelectedStages([])
  }, [])

  const handleProgramChange = (programId: string) => {
    setForm((prev) => ({ ...prev, program_id: programId }))
    loadStages(programId)
  }

  const toggleStage = (stageId: string) => {
    setSelectedStages((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.program_id || !form.title) {
      addToast({ type: 'error', message: t('admin.common.fillRequired') })
      return
    }

    setSaving(true)
    try {
      if (isEdit && missionId) {
        await missionService.update(missionId, {
          program_id: form.program_id,
          title: form.title,
          related_stage_ids: selectedStages.length > 0 ? selectedStages : undefined,
        })
        addToast({ type: 'success', message: t('admin.missions.updatedToast') })
      } else {
        await missionService.create({
          program_id: form.program_id,
          title: form.title,
          related_stage_ids: selectedStages.length > 0 ? selectedStages : undefined,
        })
        addToast({ type: 'success', message: t('admin.missions.createdToast') })
      }
      navigate(ROUTES.ADMIN.MISSIONS)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? t('admin.missions.editTitle') : t('admin.missions.new')}
        subtitle={isEdit ? t('admin.missions.editSubtitle') : t('admin.missions.newSubtitle')}
        breadcrumbs={[
          { label: t('admin.missions.bankTitle'), href: ROUTES.ADMIN.MISSIONS },
          { label: isEdit ? t('admin.common.edit') : t('admin.common.add') },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-4">
          <Select
            label={t('admin.col.program')}
            required
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            value={form.program_id}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder={t('admin.topic.pickProgram')}
          />

          <Input
            label={t('admin.missions.title')}
            id="judul"
            required
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder={t('admin.missions.titlePlaceholder')}
          />

          {stages.length > 0 && (
            <div className="w-full">
              <label className="block text-sm font-medium text-on-surface mb-2">
                {t('admin.missions.relatedStages')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {stages.map((stage) => {
                  const isSelected = selectedStages.includes(stage.id)
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => toggleStage(stage.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary-container/30 text-primary'
                          : 'border-outline-variant text-on-surface hover:border-primary/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          isSelected ? 'bg-primary border-primary' : 'border-outline-variant'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate">{stage.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.MISSIONS)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {isEdit ? t('common.save') : t('admin.common.add')}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default MissionFormPage
