import { describe, expect, it } from 'vitest'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import type { ConsentFlatItem } from '@/core/types'
import { ConsentTable } from '@/features/admin/components/ConsentTable'

const makeItem = (over: Partial<ConsentFlatItem> & { participant_id: string }): ConsentFlatItem => ({
  child_name: 'Anak Satu',
  parent_name: 'Orang Tua',
  parent_phone: '0812000000',
  session_id: 'session-1',
  session_name: 'Sesi 1',
  session_date: '2026-09-30',
  location: 'Lokasi',
  program_name: 'Program A',
  consent_status: 'pending',
  has_token: true,
  ...over,
})

// One row per actionable branch — send / resend / queued — plus a `none` row
// that renders the `-` cell and has no button at all.
const sendItem = makeItem({ participant_id: 'p1', consent_status: 'not_sent' }) // → send
const resendItem = makeItem({ participant_id: 'p2', consent_status: 'pending' }) // → resend
const queuedItem = makeItem({ participant_id: 'p3', delivery_status: 'queued' }) // → queued
const noneItem = makeItem({ participant_id: 'p4', consent_status: 'granted' }) // → none

const items = [sendItem, resendItem, queuedItem, noneItem]
const noop = () => { }

const renderTable = (props: { sending?: Record<string, boolean>; batchSending?: boolean }) =>
  render(
    <ConsentTable
      items={items}
      sending={props.sending ?? {}}
      batchSending={props.batchSending}
      onSend={noop}
      onResend={noop}
      page={1}
      totalPages={1}
      totalItems={items.length}
      onPageChange={noop}
    />,
  )

const sendLabel = i18n.t('admin.consent.send')
const resendLabel = i18n.t('admin.consent.resend')
const queuedLabel = i18n.t('admin.status.queued')

describe('ConsentTable batch progress', () => {
  it('renders the circular spinner on every action row during send-all', () => {
    const { container } = renderTable({ batchSending: true })

    const sendBtn = screen.getByRole('button', { name: sendLabel })
    const resendBtn = screen.getByRole('button', { name: resendLabel })
    const queuedBtn = screen.getByRole('button', { name: queuedLabel })

    // 3 action-bearing rows → 3 spinners. The `none` row has no button and
    // pagination buttons never load, so nothing else contributes.
    expect(container.querySelectorAll('button .animate-spin')).toHaveLength(3)

    for (const btn of [sendBtn, resendBtn, queuedBtn]) {
      expect(btn.querySelector('.animate-spin')).not.toBeNull()
      expect(btn).toBeDisabled()
    }
  })

  it('keeps the per-row spinner scoped to the single sending row', () => {
    const { container } = renderTable({ batchSending: false, sending: { p1: true } })

    const sendBtn = screen.getByRole('button', { name: sendLabel })
    const resendBtn = screen.getByRole('button', { name: resendLabel })

    expect(container.querySelectorAll('button .animate-spin')).toHaveLength(1)
    expect(sendBtn.querySelector('.animate-spin')).not.toBeNull()
    expect(sendBtn).toBeDisabled()

    expect(resendBtn.querySelector('.animate-spin')).toBeNull()
    expect(resendBtn).not.toBeDisabled()
  })
})
