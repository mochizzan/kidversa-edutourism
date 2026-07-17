import { Shield, ChevronDown, ChevronRight, Send, RefreshCw } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { formatDate, formatDateTime } from '../../../shared/utils'
import { ConsentType } from '../../../core/types'
import { ConsentStatusBadge } from './ConsentStatusBadge'
import type { SessionConsentData, ConsentStatus } from '../hooks/useConsentMonitor'
import type { ConsentLog } from '../../../core/types'
import type { useConsentProgress } from '../../../shared/hooks/useConsentProgress'

type ConsentProgress = ReturnType<typeof useConsentProgress>['progress']

interface ConsentSessionCardProps {
  data: SessionConsentData
  expanded: boolean
  isActiveBatch: boolean
  activeBatchTotal: number
  progress: ConsentProgress
  sending: boolean
  getConsentStatus: (
    participantId: string,
    consentType: ConsentType,
    logs: ConsentLog[],
  ) => ConsentStatus
  onSend: (force?: boolean) => void
  onToggle: () => void
}

export const ConsentSessionCard = ({
  data,
  expanded,
  isActiveBatch,
  activeBatchTotal,
  progress,
  sending,
  getConsentStatus,
  onSend,
  onToggle,
}: ConsentSessionCardProps) => {
  const { session } = data
  const totalParticipants = data.participants.length

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-on-primary-container" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-on-surface truncate">{session.name}</p>
              <p className="text-xs text-on-surface-variant">
                {formatDate(session.session_date)} — {session.location}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="primary">{totalParticipants} peserta</Badge>
            {data.pendingCount > 0 ? (
              <Badge variant="warning">{data.pendingCount} pending</Badge>
            ) : (
              <Badge variant="success">Lengkap</Badge>
            )}
          </div>
        </div>

        {isActiveBatch && progress && (
          <div className="mt-3 rounded-xl bg-primary-container/40 p-3 text-sm">
            {progress.type === 'progress' && progress.data.status ? (
              <span className="text-on-surface-variant">
                Mengirim ke {progress.data.child_name ?? progress.data.participant_id}... (
                {progress.data.status})
              </span>
            ) : progress.type === 'done' ? (
              <span className="text-green-700 font-medium">
                Selesai: {progress.data.sent ?? 0}/{progress.data.total ?? 0} berhasil
              </span>
            ) : (
              <span className="text-on-surface-variant">
                Mengirim {activeBatchTotal} peserta...
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="text-on-surface-variant">Rekaman:</span>
          <span className="text-green-600 font-medium">
            {data.consentedRecording}/{totalParticipants}
          </span>
          <span className="text-on-surface-variant">Foto:</span>
          <span className="text-green-600 font-medium">
            {data.consentedPhoto}/{totalParticipants}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Send className="w-4 h-4" />}
              onClick={() => onSend()}
              loading={sending || isActiveBatch}
              disabled={isActiveBatch}
            >
              {isActiveBatch ? 'Mengirim...' : 'Kirim via WhatsApp'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => onSend(true)}
              loading={sending || isActiveBatch}
              disabled={isActiveBatch}
            >
              Kirim Ulang
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={
                expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
              }
              onClick={onToggle}
            >
              Detail
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-outline-variant">
          {data.participants.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-on-surface-variant">Tidak ada peserta di sesi ini</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant">
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-surface-container-low text-xs font-medium text-on-surface-variant">
                <span className="flex-[2]">Nama Anak</span>
                <span className="flex-[2]">Orang Tua</span>
                <span className="flex-1">Rekaman</span>
                <span className="flex-1">Foto</span>
                <span className="flex-[1.5]">Tanggal Respon</span>
              </div>

              {data.participants.map((participant) => {
                const recordingStatus = getConsentStatus(
                  participant.id,
                  ConsentType.RECORDING,
                  data.logs,
                )
                const photoStatus = getConsentStatus(participant.id, ConsentType.PHOTO, data.logs)
                const log = data.logs.find((l) => l.participant_id === participant.id)

                return (
                  <div
                    key={participant.id}
                    className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-3 hover:bg-surface-container-low/50 transition-colors"
                  >
                    <div className="flex-[2] min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {participant.child_name}
                      </p>
                      <p className="text-xs text-on-surface-variant md:hidden">
                        {participant.parent_name} — {participant.parent_phone}
                      </p>
                    </div>
                    <div className="hidden md:block flex-[2] min-w-0">
                      <p className="text-sm text-on-surface truncate">{participant.parent_name}</p>
                      <p className="text-xs text-on-surface-variant">{participant.parent_phone}</p>
                    </div>
                    <div className="flex-1">
                      <ConsentStatusBadge status={recordingStatus} />
                    </div>
                    <div className="flex-1">
                      <ConsentStatusBadge status={photoStatus} />
                    </div>
                    <div className="flex-[1.5]">
                      <span className="text-xs text-on-surface-variant">
                        {log?.responded_at ? formatDateTime(log.responded_at) : '-'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
