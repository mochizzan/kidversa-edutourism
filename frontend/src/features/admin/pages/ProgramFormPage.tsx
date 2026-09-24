import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { BadgeEditor } from '../components/BadgeEditor'
import { friendlyError } from '../../../core/utils/errorMessages'
import { programListPath, programDetailPath } from '../../../core/constants/app'
import { useTranslation } from 'react-i18next'
import type { Program } from '../../../core/types'

const ProgramFormPage = () => {
  const { t } = useTranslation()
  const { programId } = useParams<{ programId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isEdit = !!programId && programId !== 'new'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [finalBadgeName, setFinalBadgeName] = useState('')
  const [finalBadgeImageUrl, setFinalBadgeImageUrl] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit || !programId) return
    let cancelled = false
      ; (async () => {
        setLoading(true)
        try {
          const program = await programService.getById(programId)
          if (cancelled || !program) return
          setName(program.name)
          setDescription(program.description ?? '')
          setIsActive(program.is_active)
          setFinalBadgeName(program.final_badge_name ?? '')
          setFinalBadgeImageUrl(program.final_badge_image_url ?? '')
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
        }
      })()
    return () => { cancelled = true }
  }, [programId, isEdit, addToast])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      addToast({ type: 'error', message: t('admin.programs.nameRequired') })
      return
    }
    setSaving(true)
    try {
      let result: Program
      const payload = {
        name: trimmedName,
        description,
        final_badge_name: finalBadgeName,
        final_badge_image_url: finalBadgeImageUrl,
      }
      if (isEdit && programId) {
        result = await programService.update(programId, { ...payload, is_active: isActive })
        addToast({ type: 'success', message: t('admin.programs.savedToast') })
        navigate(programDetailPath(result.id), { replace: true })
      } else {
        result = await programService.create(payload)
        addToast({ type: 'success', message: t('admin.programs.createdToast') })
        navigate(programDetailPath(result.id), { state: { fromCreate: true } })
      }
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? t('admin.programs.editTitle') : t('admin.programs.newTitle')}
        subtitle={isEdit ? t('admin.programs.editSubtitle') : t('admin.programs.newSubtitle')}
        breadcrumbs={[
          { label: t('admin.sidebar.programs'), href: programListPath() },
          { label: isEdit ? t('admin.programs.editTitle') : t('admin.common.createNew') },
        ]}
      />

      <Card>
        <form className="space-y-6 max-w-2xl" onSubmit={handleSubmit}>
          <Input
            label={t('admin.col.programName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('admin.programs.namePlaceholder')}
            required
            disabled={saving}
          />

          <div>
            <label className="block text-sm font-medium text-on-surface mb-1">{t('admin.programs.descLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none disabled:bg-surface-container-low disabled:text-on-surface-variant"
              rows={4}
              placeholder={t('admin.programs.descPlaceholder')}
              disabled={saving}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
                disabled={saving}
              />
              <label htmlFor="is-active" className="text-sm text-on-surface">{t('admin.programs.activeLabel')}</label>
            </div>
          )}

          <BadgeEditor
            title={t('admin.programs.finalBadgeTitle')}
            variant="final"
            name={finalBadgeName}
            imageUrl={finalBadgeImageUrl}
            helperText={t('admin.programs.finalBadgeHelp')}
            onNameChange={setFinalBadgeName}
            onImageChange={setFinalBadgeImageUrl}
          />

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => navigate(programListPath())}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? t('admin.programs.saveChanges') : t('admin.programs.saveBtn')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default ProgramFormPage
