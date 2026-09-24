import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { formatDateTime } from '../../../shared/utils'
import { Pencil, Trash2, School2, UserRound, Phone, Mail, CalendarDays, Camera } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import type { Participant } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useTranslation } from 'react-i18next'

const ParticipantDetailPage = () => {
  const { t } = useTranslation()
  const { participantId } = useParams<{ participantId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  const [participant, setParticipant] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!participantId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadParticipant = async () => {
      try {
        const result = await participantService.getById(participantId)
        if (!cancelled) setParticipant(result)
      } catch {
        if (!cancelled) setParticipant(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadParticipant()
    return () => { cancelled = true }
  }, [participantId])

  const handleDelete = async () => {
    if (!participant) return
    try {
      // Global participant deletes are not exposed by the backend; remove the
      // participant from its session instead.
      if (!participant.session_id) {
        addToast({ type: 'error', message: t('admin.participants.noSessionDelete') })
        setConfirmOpen(false)
        return
      }
      await sessionService.removeParticipant(participant.session_id, participant.id)
      addToast({ type: 'success', message: t('admin.participants.deletedToast') })
      navigate(ROUTES.ADMIN.PARTICIPANTS)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setConfirmOpen(false)
    }
  }

  if (loading) {
    return <div className="text-on-surface-variant">{t('admin.participants.detailLoading')}</div>
  }

  if (!participant) {
    return (
      <ErrorState
        title={t('admin.participants.notFound')}
        message={t('admin.participants.notFoundDesc')}
        action={{ label: t('common.back'), onClick: () => navigate(ROUTES.ADMIN.PARTICIPANTS) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: t('admin.sidebar.participants'), href: ROUTES.ADMIN.PARTICIPANTS },
          { label: participant.child_name },
        ]}
        title={participant.child_name}
        subtitle={`${t('admin.participants.ageShort', { age: participant.child_age })}${participant.school_name ? ` · ${participant.school_name}` : ''} · ${participant.parent_name}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`${ROUTES.ADMIN.PARTICIPANTS}/${participant.id}/edit`}>
              <Button variant="secondary" icon={<Pencil className="w-4 h-4" />}>{t('admin.common.edit')}</Button>
            </Link>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}>{t('common.delete')}</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title={t('admin.participants.identityCard')}>
          <div className="space-y-3 text-sm text-on-surface-variant">
            <p className="flex items-center gap-2"><UserRound className="w-4 h-4" /> {participant.child_name}</p>
            <p className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> {t('admin.participants.ageShort', { age: participant.child_age })}</p>
            <p className="flex items-center gap-2"><School2 className="w-4 h-4" /> {participant.school_name || t('admin.participants.noSchool')}</p>
            <p className="flex items-center gap-2"><Phone className="w-4 h-4" /> {participant.parent_phone}</p>
            <p className="flex items-center gap-2"><Mail className="w-4 h-4" /> {participant.parent_email || '-'}</p>
          </div>
        </Card>

        <Card title={t('admin.col.session')}>
          {participant.session_id ? (
            <div className="space-y-3 text-sm text-on-surface-variant">
              <p>{t('admin.participants.inSessionSentence')}</p>
              <Badge variant="primary">{t('admin.participants.boundStatus')}</Badge>
            </div>
          ) : (
            <EmptyState title={t('admin.participants.notJoinedTitle')} description={t('admin.participants.notJoinedDesc')} />
          )}
        </Card>

        <Card title={t('admin.participants.consentCard')}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={participant.consent_photo ? 'success' : 'danger'} size="sm">
                <Camera className="w-3 h-3 mr-1" />
                {participant.consent_photo ? t('admin.participants.consentPhotoYes') : t('admin.participants.consentPhotoNo')}
              </Badge>
            </div>
            {participant.consent_at && (
              <p className="text-xs text-on-surface-variant">
                {t('admin.participants.approvedAt', { date: formatDateTime(participant.consent_at) })}
              </p>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('admin.participants.deleteTitle')}
        message={t('admin.participants.detailDeleteMsg', { name: participant.child_name })}
        onConfirm={handleDelete}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  )
}

export default ParticipantDetailPage
