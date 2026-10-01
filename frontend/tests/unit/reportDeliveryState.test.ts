import { describe, it, expect } from 'vitest'
import { i18n } from '@/core/i18n'
import { getReportDeliveryState, REPORT_DELIVERY_LABEL } from '@/core/constants/reportStatus'
import type { ReportGenerateOperation, ReportSendOperation } from '@/core/services/types'

const gen = (queued_ids: string[], processing_ids: string[]): ReportGenerateOperation => ({
  session_id: 's1',
  started_at: '2026-09-30T00:00:00Z',
  queued_ids,
  processing_ids,
  items: [
    ...queued_ids.map((report_id) => ({ report_id, status: 'queued' as const })),
    ...processing_ids.map((report_id) => ({ report_id, status: 'processing' as const })),
  ],
  total: queued_ids.length + processing_ids.length,
  queued: queued_ids.length,
  processing: processing_ids.length,
  succeeded: 0,
  failed: 0,
})

const send = (queued_ids: string[], sending_ids: string[]): ReportSendOperation => ({
  session_id: 's1',
  updated_at: '2026-09-30T00:00:00Z',
  queued_ids,
  sending_ids,
})

describe('getReportDeliveryState — per-row mapping table', () => {
  it('send flow: in sending_ids → processing, in queued_ids → queued, else persisted UI', () => {
    expect(getReportDeliveryState('r1', { activeSend: send([], ['r1']) })).toBe('processing')
    expect(getReportDeliveryState('r1', { activeSend: send(['r1'], []) })).toBe('queued')
    // Row belongs to neither list → existing persisted-status UI.
    expect(getReportDeliveryState('r1', { activeSend: send(['r2'], ['r2']) })).toBe(null)
  })

  it('generate flow: in processing_ids → processing, in queued_ids → queued, else persisted UI', () => {
    expect(getReportDeliveryState('r1', { activeGenerate: gen([], ['r1']) })).toBe('processing')
    expect(getReportDeliveryState('r1', { activeGenerate: gen(['r1'], []) })).toBe('queued')
    expect(getReportDeliveryState('r1', { activeGenerate: gen(['r2'], ['r2']) })).toBe(null)
  })

  it('flags absent or null → persisted UI for every row (terminal states included)', () => {
    expect(getReportDeliveryState('r1', {})).toBe(null)
    expect(getReportDeliveryState('r1', { activeGenerate: null, activeSend: null })).toBe(null)
    expect(getReportDeliveryState('r1', { activeGenerate: gen([], []), activeSend: send([], []) })).toBe(null)
  })

  it('in-flight beats queued across flows (processing priority)', () => {
    expect(
      getReportDeliveryState('r1', {
        activeGenerate: gen(['r1'], []),
        activeSend: send([], ['r1']),
      }),
    ).toBe('processing')
    expect(
      getReportDeliveryState('r1', {
        activeGenerate: gen([], ['r1']),
        activeSend: send(['r1'], []),
      }),
    ).toBe('processing')
  })

  it('rows without a report id always fall back to the persisted UI', () => {
    expect(getReportDeliveryState(null, { activeSend: send([], ['r1']) })).toBe(null)
    expect(getReportDeliveryState(undefined, { activeGenerate: gen(['r1'], []) })).toBe(null)
    expect(getReportDeliveryState('', { activeGenerate: gen(['r1'], []) })).toBe(null)
  })

  it('uses the same two i18n keys for both flows, resolvable via i18n.t', () => {
    expect(REPORT_DELIVERY_LABEL.processing).toBe('admin.status.processing')
    expect(REPORT_DELIVERY_LABEL.queued).toBe('admin.status.queued')
    const processing = i18n.t(REPORT_DELIVERY_LABEL.processing)
    const queued = i18n.t(REPORT_DELIVERY_LABEL.queued)
    expect(typeof processing).toBe('string')
    expect(typeof queued).toBe('string')
    expect(processing.length).toBeGreaterThan(0)
    expect(queued.length).toBeGreaterThan(0)
    expect(processing).not.toBe(queued)
  })
})
