import { Card } from '../../../shared/components/ui/Card'
import { formatDate } from '../../../shared/utils'
import type { Session } from '../../../core/types'

interface SessionInfoTabProps {
  session: Session
  programName: string
}

export function SessionInfoTab({ session, programName }: SessionInfoTabProps) {
  return (
    <Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-on-surface-variant">Program</p>
          <p className="font-medium text-on-surface">{programName}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">Lokasi</p>
          <p className="font-medium text-on-surface">{session.location}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">Tanggal</p>
          <p className="font-medium text-on-surface">{formatDate(session.session_date)}</p>
        </div>
        <div>
          <p className="text-sm text-on-surface-variant">Catatan</p>
          <p className="font-medium text-on-surface">{session.notes || '-'}</p>
        </div>
      </div>
    </Card>
  )
}
