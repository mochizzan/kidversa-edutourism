import { Card } from '../../../shared/components/ui/Card'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/utils'
import type { Session } from '../../../core/types'

interface SessionInfoTabProps {
  session: Session
  programName: string
}

export function SessionInfoTab({ session, programName }: SessionInfoTabProps) {
  const { t } = useTranslation()
  const timeDisplay = session.start_time && session.end_time
    ? `${session.start_time.slice(0, 5)} – ${session.end_time.slice(0, 5)}`
    : t('admin.sessions.allDay')

  return (
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-on-surface-variant">{t('admin.col.program')}</p>
          <p className="font-medium text-on-surface">{programName}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">{t('admin.sessions.infoLocation')}</p>
          <p className="font-medium text-on-surface">{session.location}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">{t('admin.col.date')}</p>
          <p className="font-medium text-on-surface">{formatDate(session.session_date)}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">{t('admin.sessions.infoTimeLabel')}</p>
          <p className="font-medium text-on-surface">{timeDisplay}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-sm text-on-surface-variant">{t('admin.sessions.createNotesLabel')}</p>
          <p className="font-medium text-on-surface">{session.notes || '-'}</p>
        </div>
      </div>
    </Card>
  )
}
