import { Send, RefreshCw } from 'lucide-react'
import type { ConsentFlatItem } from '../../../core/types'
import { ConsentStatusBadge } from './ConsentStatusBadge'
import { formatDate, formatDateTime } from '../../../shared/utils'
import { Button } from '../../../shared/components/ui/Button'
import { CompactPagination } from '../../../shared/components/data/CompactPagination'
import { useTranslation } from 'react-i18next'

interface ConsentTableProps {
  items: ConsentFlatItem[]
  sending: Record<string, boolean>
  onSend: (participantId: string) => void
  onResend: (participantId: string) => void
  page: number
  totalPages: number
  totalItems: number
  pageSize?: number
  onPageChange: (page: number) => void
}

export function ConsentTable({
  items,
  sending,
  onSend,
  onResend,
  page,
  totalPages,
  totalItems,
  pageSize = 25,
  onPageChange,
}: ConsentTableProps) {
  const { t } = useTranslation()
  return (
    <div>
      {/* Table */}
      <div className="bg-white rounded-xl border border-outline/20 overflow-hidden">
        {/* Header — hidden on mobile */}
        <div className="hidden md:flex items-center gap-4 px-4 py-3 bg-surface-container text-xs font-medium text-on-surface-variant border-b border-outline/10">
          <span className="flex-1 min-w-0">{t('admin.col.program')}</span>
          <span className="flex-[1.2] min-w-0">{t('admin.col.session')}</span>
          <span className="flex-1 min-w-0">{t('admin.consent.childCol')}</span>
          <span className="hidden lg:block w-28">{t('admin.consent.phoneCol')}</span>
          <span className="w-24">{t('admin.col.status')}</span>
          <span className="hidden lg:block w-36">{t('admin.consent.answeredCol')}</span>
          <span className="hidden xl:block w-32">{t('admin.consent.responderCol')}</span>
          <span className="w-24 text-right">{t('admin.col.action')}</span>
        </div>

        {/* Rows */}
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-on-surface-variant">
            {t('admin.consent.emptyTable')}
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.participant_id}
              className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-4 py-3 border-b border-outline/5 last:border-b-0 hover:bg-surface-container/50 transition-colors"
            >
              {/* Program — hidden on mobile */}
              <span className="hidden md:block flex-1 min-w-0 text-sm text-on-surface truncate">
                {item.program_name}
              </span>

              {/* Session — hidden on mobile */}
              <span className="hidden md:block flex-[1.2] min-w-0">
                <span className="text-sm text-on-surface truncate block">{item.session_name}</span>
                <span className="text-xs text-on-surface-variant">{formatDate(item.session_date)}</span>
              </span>

              {/* Child name — always visible, bold */}
              <span className="flex-1 min-w-0 text-sm font-medium text-on-surface">
                {item.child_name}
                {/* Mobile: show session name inline */}
                <span className="md:hidden text-xs font-normal text-on-surface-variant block">
                  {item.session_name} · {item.program_name}
                </span>
              </span>

              {/* Phone — hidden on small screens */}
              <span className="hidden lg:block w-28 text-sm text-on-surface-variant truncate">
                {item.parent_phone}
              </span>

              {/* Consent status */}
              <span className="w-24">
                <ConsentStatusBadge status={item.consent_status} />
              </span>

              {/* Responded at — hidden on small screens */}
              <span className="hidden lg:block w-36 text-xs text-on-surface-variant">
                {item.responded_at ? formatDateTime(item.responded_at) : '-'}
              </span>

              {/* Responder name — hidden on small screens */}
              <span className="hidden xl:block w-32 text-xs text-on-surface-variant truncate">
                {item.responder_name || '-'}
              </span>

              {/* Action */}
              <span className="w-24 flex justify-end">
                {item.consent_status === 'not_sent' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Send />}
                    onClick={() => onSend(item.participant_id)}
                    loading={sending[item.participant_id]}
                  >
                    {t('admin.consent.send')}
                  </Button>
                ) : item.consent_status === 'pending' || item.consent_status === 'denied' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw />}
                    onClick={() => onResend(item.participant_id)}
                    loading={sending[item.participant_id]}
                  >
                    {t('admin.consent.resend')}
                  </Button>
                ) : (
                  <span className="text-xs text-on-surface-variant">-</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <CompactPagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={onPageChange}
        itemLabel={t('admin.consent.itemLabel')}
      />
    </div>
  )
}
