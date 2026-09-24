import { useState, useEffect, useMemo } from 'react'
import { Search, User, ArrowRightLeft } from 'lucide-react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { PhoneInput } from '../../../shared/components/ui/PhoneInput'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { cn } from '../../../core/utils'
import { friendlyError } from '../../../core/utils/errorMessages'
import { validateParticipantForm, needsAgeConfirm } from '@/core/utils/participantValidation'
import { useTranslation, Trans } from 'react-i18next'
import type { Participant, ParticipantSessionInfo } from '../../../core/types'

type ParticipantFormData = {
  child_name: string
  child_age: number
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
}

type ModalFormState = Omit<ParticipantFormData, 'child_age'> & { child_age: string }

interface ParticipantFormModalProps {
  open: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  selectOnly?: boolean
  onSubmit?: (data: ParticipantFormData) => Promise<void>
  initialData?: ParticipantFormData
  availableParticipants?: Participant[]
  onLinkExisting?: (participantId: string) => Promise<void>
  linkedParticipantIds?: string[]
  currentSessionId?: string
  participantSessionInfos?: ParticipantSessionInfo[]
}

interface FormErrors {
  child_name?: string
  child_age?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
}

export function ParticipantFormModal({
  open,
  onClose,
  onSubmit,
  mode,
  selectOnly,
  initialData,
  availableParticipants,
  onLinkExisting,
  linkedParticipantIds,
  currentSessionId,
  participantSessionInfos,
}: ParticipantFormModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ModalFormState>({
    child_name: '',
    child_age: '',
    school_name: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
  })
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectError, setSelectError] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [migrateConfirm, setMigrateConfirm] = useState<ParticipantSessionInfo | null>(null)
  const [ageConfirmOpen, setAgeConfirmOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedParticipantId('')
      setSearchQuery('')
      setSelectError('')
      setMigrateConfirm(null)
      setFormData(
        initialData
          ? { ...initialData, child_age: String(initialData.child_age) }
          : {
            child_name: '',
            child_age: '',
            school_name: '',
            parent_name: '',
            parent_phone: '',
            parent_email: '',
          }
      )
      setErrors({})
    }
  }, [open, initialData])

  const sessionInfoMap = useMemo(() => {
    const map = new Map<string, ParticipantSessionInfo>()
    if (participantSessionInfos) {
      for (const info of participantSessionInfos) {
        map.set(info.participant.id, info)
      }
    }
    return map
  }, [participantSessionInfos])

  const filteredParticipants = useMemo(() => {
    if (!availableParticipants) return []
    if (!searchQuery.trim()) return availableParticipants
    const q = searchQuery.toLowerCase()
    return availableParticipants.filter(p =>
      p.child_name.toLowerCase().includes(q) ||
      p.parent_name.toLowerCase().includes(q) ||
      p.school_name?.toLowerCase().includes(q)
    )
  }, [availableParticipants, searchQuery])

  const handleSelectConfirm = async () => {
    if (!selectedParticipantId || !onLinkExisting) return
    setSubmitting(true)
    setSelectError('')
    try {
      await onLinkExisting(selectedParticipantId)
      onClose()
    } catch (err) {
      setSelectError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleParticipantClick = (participant: Participant) => {
    const isLinked = linkedParticipantIds?.includes(participant.id) ?? false
    if (isLinked) return

    const info = sessionInfoMap.get(participant.id)
    if (info && info.session_id && info.session_id !== currentSessionId) {
      setMigrateConfirm(info)
      setSelectedParticipantId(participant.id)
    } else {
      setSelectedParticipantId(participant.id)
      setSelectError('')
    }
  }

  const handleMigrateConfirm = async () => {
    if (!migrateConfirm || !selectedParticipantId || !onLinkExisting) return
    setMigrateConfirm(null)
    setSubmitting(true)
    setSelectError('')
    try {
      await onLinkExisting(selectedParticipantId)
      onClose()
    } catch (err) {
      setSelectError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleMigrateCancel = () => {
    setMigrateConfirm(null)
    setSelectedParticipantId('')
  }

  const getParticipantBadge = (participant: Participant) => {
    const isLinked = linkedParticipantIds?.includes(participant.id) ?? false
    if (isLinked) {
      return <Badge variant="primary" size="sm">{t('admin.participants.addedBadge')}</Badge>
    }

    const info = sessionInfoMap.get(participant.id)
    if (info && info.session_id && info.session_id !== currentSessionId) {
      return (
        <Badge variant="warning" size="sm">
          <ArrowRightLeft className="w-3 h-3 mr-1" />
          {t('admin.participants.migrateFrom', { name: info.session_name })}
        </Badge>
      )
    }

    return (
      <div className="flex gap-1">
        <Badge variant={participant.consent_photo ? 'success' : 'danger'} size="sm">{t('admin.participants.photoBadge')}</Badge>
      </div>
    )
  }

  const validate = (): boolean => {
    const errs = validateParticipantForm(formData)
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const doSubmit = async () => {
    if (!onSubmit) return

    setSubmitting(true)
    try {
      const validatedData: ParticipantFormData = {
        child_name: formData.child_name.trim(),
        child_age: Number.parseInt(formData.child_age, 10),
        school_name: formData.school_name?.trim() || undefined,
        parent_name: formData.parent_name.trim(),
        parent_phone: formData.parent_phone.trim(),
        parent_email: formData.parent_email?.trim() || undefined,
      }
      await onSubmit(validatedData)
      onClose()
    } catch (err) {
      setErrors({ child_name: friendlyError(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }
    if (needsAgeConfirm(Number.parseInt(formData.child_age, 10))) {
      setAgeConfirmOpen(true)
      return
    }
    void doSubmit()
  }

  if (selectOnly && mode === 'create') {
    return (
      <>
        <Modal open={open} onClose={onClose} title={t('admin.participants.add')} size="lg">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              placeholder={t('admin.participants.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectError('') }}
              className="w-full rounded-xl border border-outline-variant bg-surface pl-10 pr-3 py-2 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
              autoFocus
            />
          </div>

          {selectError && (
            <div className="mb-3 p-3 rounded-xl bg-error-container/30 text-on-error-container text-sm">{selectError}</div>
          )}

          {!availableParticipants || availableParticipants.length === 0 ? (
            <EmptyState icon={<User className="w-12 h-12" />} title={t('admin.participants.emptyAvailableTitle')} description={t('admin.participants.emptyAvailableDesc')} />
          ) : filteredParticipants.length === 0 ? (
            <p className="text-center py-8 text-on-surface-variant text-sm">{t('admin.participants.notFound')}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredParticipants.map(p => {
                const isLinked = linkedParticipantIds?.includes(p.id) ?? false
                return (
                  <div
                    key={p.id}
                    onClick={() => handleParticipantClick(p)}
                    className={cn(
                      'p-4 rounded-xl border transition-colors',
                      isLinked
                        ? 'border-outline-variant/50 opacity-60 cursor-not-allowed'
                        : 'cursor-pointer',
                      !isLinked && selectedParticipantId === p.id
                        ? 'border-primary bg-primary-container/20'
                        : !isLinked && 'border-outline-variant hover:bg-surface-container-low'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-on-surface">{p.child_name}</span>
                          <Badge variant="neutral" size="sm">{t('admin.participants.ageAbbr', { age: p.child_age })}</Badge>
                        </div>
                        {p.school_name && <p className="text-sm text-on-surface-variant mt-0.5">{p.school_name}</p>}
                        <p className="text-sm text-on-surface-variant">{p.parent_name} · {p.parent_phone}</p>
                        {p.parent_email && <p className="text-xs text-on-surface-variant">{p.parent_email}</p>}
                      </div>
                      {getParticipantBadge(p)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-outline-variant">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button>
            <Button onClick={handleSelectConfirm} disabled={!selectedParticipantId || submitting} loading={submitting}>{t('admin.participants.addBtn')}</Button>
          </div>
        </Modal>

        <Modal
          open={!!migrateConfirm}
          onClose={handleMigrateCancel}
          title={t('admin.participants.migrateTitle')}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-on-surface">
              <Trans
                i18nKey="admin.participants.migrateRegistered"
                values={{ name: migrateConfirm?.participant.child_name, session: migrateConfirm?.session_name }}
                components={{
                  name: <span className="font-semibold" />,
                  session: <span className="font-semibold" />,
                }}
              />
            </p>
            <p className="text-sm text-on-surface-variant">
              {t('admin.participants.migrateQuestion')}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
              <Button variant="secondary" onClick={handleMigrateCancel} disabled={submitting}>{t('common.cancel')}</Button>
              <Button onClick={handleMigrateConfirm} loading={submitting}>
                <ArrowRightLeft className="w-4 h-4 mr-1" />
                {t('admin.participants.migrateBtn')}
              </Button>
            </div>
          </div>
        </Modal>
      </>
    )
  }

  const n = Number.parseInt(formData.child_age, 10)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={mode === 'create' ? t('admin.participants.add') : t('admin.participants.editTitle')}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <Input
              label={t('admin.participants.childNamePlain')}
              placeholder={t('admin.participants.childNamePlaceholder')}
              value={formData.child_name}
              onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
              error={errors.child_name}
              required
              autoFocus
            />

            <Input
              label={t('admin.participants.ageInputPlain')}
              type="number"
              placeholder={t('admin.participants.agePlaceholder')}
              value={formData.child_age}
              onChange={(e) => setFormData({ ...formData, child_age: e.target.value })}
              error={errors.child_age}
              hint={t('admin.participants.ageHint')}
              required
            />

            <Input
              label={t('admin.participants.schoolLabel')}
              placeholder={t('admin.participants.schoolPlaceholder')}
              value={formData.school_name}
              onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
            />

            <Input
              label={t('admin.participants.parentNamePlain')}
              placeholder={t('admin.participants.parentNamePlaceholder')}
              value={formData.parent_name}
              onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
              error={errors.parent_name}
              required
            />

            <PhoneInput
              id="parent_phone"
              label={t('admin.participants.parentPhoneLabel')}
              required
              value={formData.parent_phone}
              onChange={(v) => setFormData({ ...formData, parent_phone: v })}
              error={errors.parent_phone}
              hint={t('admin.participants.phoneHint')}
              placeholder="8123456789"
            />

            <Input
              label={t('admin.participants.parentEmailLabel')}
              type="email"
              placeholder={t('admin.participants.parentEmailPlaceholder')}
              value={formData.parent_email}
              onChange={(e) => setFormData({ ...formData, parent_email: e.target.value })}
              error={errors.parent_email}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={submitting}>
              {mode === 'create' ? t('admin.common.add') : t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={ageConfirmOpen}
        onClose={() => setAgeConfirmOpen(false)}
        title={t('admin.participants.ageConfirmTitle')}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-on-surface">
            {t('admin.participants.ageConfirmMsg', { age: n, name: formData.child_name.trim() })}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
            <Button variant="secondary" onClick={() => setAgeConfirmOpen(false)}>
              {t('common.back')}
            </Button>
            <Button
              onClick={() => {
                setAgeConfirmOpen(false)
                void doSubmit()
              }}
            >
              {t('admin.participants.continueYes')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
