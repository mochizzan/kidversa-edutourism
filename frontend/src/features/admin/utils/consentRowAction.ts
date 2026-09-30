import type { ConsentFlatItem } from '../../../core/types'

// Row-level action for the consent monitor table, derived from SERVER state.
export type ConsentRowAction = 'queued' | 'processing' | 'resend' | 'send' | 'none'

type ConsentRowActionInput = Pick<ConsentFlatItem, 'consent_status' | 'delivery_status'>

// Priority: per-batch delivery overlay wins over persisted consent rules.
//   queued                          → disabled "Dalam Antrian"
//   processing                      → spinner "Memproses", disabled
//   sent | failed                   → resend ("Kirim Ulang")
//   absent                          → existing rules: granted → "-",
//                                      pending | denied → "Kirim Ulang",
//                                      not_sent → "Kirim"
export function getConsentRowAction(item: ConsentRowActionInput): ConsentRowAction {
  switch (item.delivery_status) {
    case 'queued':
      return 'queued'
    case 'processing':
      return 'processing'
    case 'sent':
    case 'failed':
      return 'resend'
    default:
      break
  }

  if (item.consent_status === 'not_sent') return 'send'
  if (item.consent_status === 'pending' || item.consent_status === 'denied') return 'resend'
  return 'none'
}
