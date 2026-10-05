import { useTranslation } from 'react-i18next'
import { ArrowRightLeft } from 'lucide-react'
import { Badge } from './Badge'
import { cn } from '../../../core/utils'
import { sessionStatusLabel } from '../../../core/utils/sessionStatus'

interface ProvenanceBadgeProps {
 /** Non-null ⇒ row is a clone carried by the participant-migration flow. */
 sourceSessionId?: string | null
 /** Snapshot name of the source session (reports only; null ⇒ generic copy). */
 sourceSessionName?: string | null
 /** Snapshot status of the source session (reports only). */
 sourceSessionStatus?: string | null
 size?: 'sm' | 'md'
 className?: string
}

/**
 * Label for cloned/carried rows: renders NOTHING for natively created data
 * (source_session_id null/undefined — the backend always sends the field, so
 * absence only happens on legacy payloads). Reports show the full
 * "Bawaan sesi {name} — sesi sumber {status}" line; assessments (id only)
 * fall back to the generic "Bawaan sesi lain".
 */
export function ProvenanceBadge({
 sourceSessionId,
 sourceSessionName,
 sourceSessionStatus,
 size = 'sm',
 className,
}: ProvenanceBadgeProps) {
 const { t } = useTranslation()
 if (!sourceSessionId) return null

 const statusText = sourceSessionStatus
  ? sessionStatusLabel(sourceSessionStatus)
  : undefined

 const text = statusText
  ? sourceSessionName
   ? t('common.provenance.withNameStatus', { name: sourceSessionName, status: statusText })
   : t('common.provenance.genericStatus', { status: statusText })
  : sourceSessionName
   ? t('common.provenance.withName', { name: sourceSessionName })
   : t('common.provenance.generic')

 return (
  <Badge variant="warning" size={size} className={className} >
   <ArrowRightLeft className={cn('shrink-0', size === 'sm' ? 'w-3 h-3 mr-1' : 'w-3.5 h-3.5 mr-1.5')} />
   {text}
  </Badge>
 )
}

export default ProvenanceBadge
