import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Baby, Loader2, Save, Users } from 'lucide-react'
import { ROUTES } from '../../../core/constants/app'
import { validateParticipantForm, needsAgeConfirm } from '@/core/utils/participantValidation'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { Modal } from '../../../shared/components/ui/Modal'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { PhoneInput } from '../../../shared/components/ui/PhoneInput'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import { ApiError } from '../../../core/services/backend-client'
import { friendlyError } from '../../../core/utils/errorMessages'
import { redirectToLogin } from '../../../core/stores/authStore'
import { useTranslation, Trans } from 'react-i18next'

type ParticipantFormState = {
  child_name: string
  child_age: string
  school_name: string
  parent_name: string
  parent_phone: string
  parent_email: string
}

type ParticipantFormErrors = {
  child_name?: string
  child_age?: string
  school_name?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
}

const emptyForm: ParticipantFormState = {
  child_name: '',
  child_age: '',
  school_name: '',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
}

const ParticipantFormPage = () => {
  const { t } = useTranslation()
  const { participantId } = useParams<{ participantId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(participantId)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ParticipantFormState>(emptyForm)
  const [errors, setErrors] = useState<ParticipantFormErrors>({})
  const [ageConfirmOpen, setAgeConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isEdit || !participantId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadParticipant = async () => {
      try {
        const found = await participantService.getById(participantId)
        if (cancelled) return

        if (!found) {
          addToast({ type: 'error', message: t('admin.participants.notFound') })
          navigate(ROUTES.ADMIN.PARTICIPANTS, { replace: true })
          return
        }

        setForm({
          child_name: found.child_name,
          child_age: String(found.child_age),
          school_name: found.school_name || '',
          parent_name: found.parent_name,
          parent_phone: found.parent_phone,
          parent_email: found.parent_email || '',
        })
      } catch {
        if (!cancelled) {
          addToast({ type: 'error', message: t('admin.participants.loadError') })
          navigate(ROUTES.ADMIN.PARTICIPANTS, { replace: true })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadParticipant()

    return () => {
      cancelled = true
    }
  }, [isEdit, participantId, addToast, navigate, t])

  const validate = (): boolean => {
    const errs = validateParticipantForm(form)
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleChange = (key: keyof ParticipantFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const doSubmit = async (childAge: number) => {
    const trimmedEmail = form.parent_email.trim()

    setSaving(true)
    try {
      // The backend exposes participant writes only via per-session routes
      // (it has no global create/update). The standalone participant form has
      // no session context, so writes are routed through the session that the
      // participant is linked to. If the participant is not yet attached to a
      // session, editing/creating here is unsupported by the backend.
      if (isEdit && participantId) {
        const existing = await participantService.getById(participantId)
        if (!existing?.session_id) {
          addToast({ type: 'error', message: t('admin.participants.notLinked') })
          return
        }
        await sessionService.updateParticipant(existing.session_id, participantId, {
          child_name: form.child_name.trim(),
          child_age: childAge,
          school_name: form.school_name.trim() || undefined,
          parent_name: form.parent_name.trim(),
          parent_phone: form.parent_phone.trim(),
          parent_email: trimmedEmail || undefined,
        })
        addToast({ type: 'success', message: t('admin.participants.updatedToast') })
      } else {
        await participantService.create({
          child_name: form.child_name.trim(),
          child_age: childAge,
          school_name: form.school_name.trim() || undefined,
          parent_name: form.parent_name.trim(),
          parent_phone: form.parent_phone.trim(),
          parent_email: trimmedEmail || undefined,
        })
        addToast({ type: 'success', message: t('admin.participants.createdToast') })
      }

      navigate(ROUTES.ADMIN.PARTICIPANTS)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          redirectToLogin()
          return
        }
        addToast({ type: 'error', message: friendlyError(err) })
      } else {
        addToast({ type: 'error', message: t('admin.participants.saveError') })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    const n = Number.parseInt(form.child_age, 10)
    if (needsAgeConfirm(n)) {
      setAgeConfirmOpen(true)
      return
    }
    void doSubmit(n)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const n = Number.parseInt(form.child_age, 10)

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? t('admin.participants.editTitle') : t('admin.participants.newTitle')}
        subtitle={isEdit ? t('admin.participants.editSubtitle') : t('admin.participants.newSubtitle')}
        breadcrumbs={[
          { label: t('admin.sidebar.participants'), href: ROUTES.ADMIN.PARTICIPANTS },
          { label: isEdit ? t('admin.common.edit') : t('admin.common.add') },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl" noValidate>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-primary shrink-0">
              <Baby className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-semibold text-on-surface">{t('admin.participants.childDataTitle')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('admin.participants.childNameLabel')}
              required
              autoFocus
              value={form.child_name}
              onChange={(e) => handleChange('child_name', e.target.value)}
              placeholder={t('admin.participants.childNamePlaceholder')}
              error={errors.child_name}
            />

            <Input
              label={t('admin.participants.ageInputLabel')}
              type="number"
              required
              value={form.child_age}
              onChange={(e) => handleChange('child_age', e.target.value)}
              placeholder={t('admin.participants.agePlaceholder')}
              hint={t('admin.participants.ageHint')}
              error={errors.child_age}
            />

            <Input
              label={t('admin.participants.schoolLabel')}
              value={form.school_name}
              onChange={(e) => handleChange('school_name', e.target.value)}
              placeholder={t('admin.participants.schoolPlaceholder')}
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-semibold text-on-surface">{t('admin.participants.parentDataTitle')}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('admin.participants.parentNameLabel')}
              required
              value={form.parent_name}
              onChange={(e) => handleChange('parent_name', e.target.value)}
              placeholder={t('admin.participants.parentNamePlaceholder')}
              error={errors.parent_name}
            />

            <Input
              label={t('admin.participants.parentEmailLabel')}
              type="email"
              value={form.parent_email}
              onChange={(e) => handleChange('parent_email', e.target.value)}
              placeholder={t('admin.participants.parentEmailPlaceholder')}
              error={errors.parent_email}
            />

            <div className="md:col-span-2">
              <PhoneInput
                id="parent_phone"
                label={t('admin.participants.parentPhoneLabel')}
                required
                value={form.parent_phone}
                onChange={(v) => handleChange('parent_phone', v)}
                error={errors.parent_phone}
                hint={t('admin.participants.phoneHint')}
                placeholder="8123456789"
              />
            </div>
          </div>
        </Card>

        <p className="text-xs text-on-surface-variant">
          <Trans i18nKey="admin.participants.requiredNote" components={{ span: <span className="text-error font-medium" /> }} />
        </p>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.PARTICIPANTS)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {isEdit ? t('common.save') : t('admin.common.add')}
          </Button>
        </div>
      </form>

      <Modal
        open={ageConfirmOpen}
        onClose={() => setAgeConfirmOpen(false)}
        title={t('admin.participants.ageConfirmTitle')}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface">
            {t('admin.participants.ageConfirmMsg', { age: n, name: form.child_name.trim() })}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setAgeConfirmOpen(false)}>
              {t('common.back')}
            </Button>
            <Button
              onClick={() => {
                setAgeConfirmOpen(false)
                void doSubmit(n)
              }}
            >
              {t('admin.participants.continueYes')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ParticipantFormPage
