import { describe, expect, it } from 'vitest'
import {
  getConsentRowAction,
  type ConsentRowAction,
} from '@/features/admin/utils/consentRowAction'
import type { ConsentFlatItem } from '@/core/types'

type DeliveryStatus = ConsentFlatItem['delivery_status']
type ConsentStatus = ConsentFlatItem['consent_status']

// Every combination of delivery_status × consent_status → expected row action.
const TABLE: Array<[DeliveryStatus, ConsentStatus, ConsentRowAction]> = [
  // queued → disabled "Dalam Antrian" regardless of consent state
  ['queued', 'granted', 'queued'],
  ['queued', 'pending', 'queued'],
  ['queued', 'denied', 'queued'],
  ['queued', 'not_sent', 'queued'],
  // processing → spinner "Memproses", disabled
  ['processing', 'granted', 'processing'],
  ['processing', 'pending', 'processing'],
  ['processing', 'denied', 'processing'],
  ['processing', 'not_sent', 'processing'],
  // sent | failed → resend ("Kirim Ulang")
  ['sent', 'granted', 'resend'],
  ['sent', 'pending', 'resend'],
  ['sent', 'denied', 'resend'],
  ['sent', 'not_sent', 'resend'],
  ['failed', 'granted', 'resend'],
  ['failed', 'pending', 'resend'],
  ['failed', 'denied', 'resend'],
  ['failed', 'not_sent', 'resend'],
  // absent → existing persisted rules unchanged
  [undefined, 'granted', 'none'],
  [undefined, 'pending', 'resend'],
  [undefined, 'denied', 'resend'],
  [undefined, 'not_sent', 'send'],
]

describe('getConsentRowAction', () => {
  it.each(TABLE)(
    'delivery=%s consent=%s → %s',
    (delivery_status, consent_status, expected) => {
      expect(getConsentRowAction({ consent_status, delivery_status })).toBe(expected)
    },
  )

  it('covers all 5×4 delivery×consent combinations', () => {
    expect(TABLE).toHaveLength(20)
    expect(new Set(TABLE.map(([d, c]) => `${d}|${c}`)).size).toBe(20)
  })
})
