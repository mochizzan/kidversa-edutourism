import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { ApiError } from '@/core/services/backend-client'
import { useToastStore } from '@/core/stores/toastStore'
import type { ConsentFlatItem } from '@/core/types'
import type { ConsentFlatResult } from '@/core/services/types'

// Fake SSE registry — captures every stream opened by useConsentProgress so
// tests can simulate `error` / `done` events on the real transport path.
const sse = vi.hoisted(() => {
  const opened: Array<{
    path: string
    listeners: Record<string, (event: { data: string }) => void>
    close: () => void
    fire: (type: string, data: unknown) => void
    error: () => void
  }> = []
  return { opened, throwOnOpen: false }
})

vi.mock('@/core/services/consent', () => ({
  consentService: {
    getFlat: vi.fn(),
    sendSingle: vi.fn(),
    sendViaWhatsApp: vi.fn(),
    submitCombined: vi.fn(),
    getInfo: vi.fn(),
  },
}))

vi.mock('@/core/services/backend-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    openSSE: vi.fn((path: string, _onEvent: (data: unknown) => void, opts?: { onError?: (ev: Event) => void }) => {
      if (sse.throwOnOpen) throw new Error('EventSource construction failed')
      const listeners: Record<string, (event: { data: string }) => void> = {}
      const source = {
        readyState: 0,
        onopen: null as (() => void) | null,
        onerror: null as ((ev?: Event) => void) | null,
        addEventListener: (type: string, cb: (event: { data: string }) => void) => {
          listeners[type] = cb
        },
        close: () => {
          source.readyState = 2
        },
      }
      // Mirror the real openSSE: connection errors (before or after open)
      // route to opts.onError through source.onerror.
      source.onerror = (ev?: Event) => opts?.onError?.(ev ?? new Event('error'))
      sse.opened.push({
        path,
        listeners,
        close: () => source.close(),
        fire: (type: string, data: unknown) => {
          listeners[type]?.({ data: JSON.stringify(data) })
        },
        error: () => source.onerror?.(new Event('error')),
      })
      // EventSource opens asynchronously — mimic onopen on the next tick.
      setTimeout(() => source.onopen?.(), 0)
      return source as unknown as EventSource
    }),
  }
})

// Import after mocks are registered
import ConsentMonitorPage from '@/features/admin/pages/ConsentMonitorPage'
import { consentService } from '@/core/services/consent'

const flush = () => act(async () => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  await promise
})

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

const queuedItem = makeItem({ participant_id: 'p1', delivery_status: 'queued' })
const processingItem = makeItem({ participant_id: 'p2', delivery_status: 'processing' })

// Server still running a batch → per-row overlay + active_batches present.
const activeResponse: ConsentFlatResult = {
  items: [queuedItem, processingItem],
  extras: {
    active_batches: [
      {
        batch_id: 'batch-1',
        session_id: 'session-1',
        started_at: '2026-09-30T00:00:00Z',
        total: 2,
        sent: 0,
        failed: 0,
      },
    ],
  },
}

// Batch finished (success OR error) → terminal overlay, no active batches.
const terminalResponse: ConsentFlatResult = {
  items: [
    makeItem({ participant_id: 'p1', delivery_status: 'sent' }),
    makeItem({ participant_id: 'p2', delivery_status: 'failed' }),
  ],
  extras: {},
}

// Server restart / registry loss: watched batches gone AND no terminal
// delivery overlay left (the in-memory registry was wiped).
const interruptedResponse: ConsentFlatResult = {
  items: [makeItem({ participant_id: 'p1' }), makeItem({ participant_id: 'p2' })],
  extras: {},
}

// REAL backend contract for a finished batch: the registry RETAINS completed
// batches in active_batches (newest ~20) with sent+failed === total, while
// the rows carry the terminal delivery overlay. Presence alone must therefore
// never keep the bulk button spinning — the counters decide.
const retainedTerminalResponse: ConsentFlatResult = {
  items: [
    makeItem({ participant_id: 'p1', delivery_status: 'sent' }),
    makeItem({ participant_id: 'p2', delivery_status: 'failed' }),
  ],
  extras: {
    active_batches: [
      {
        batch_id: 'batch-1',
        session_id: 'session-1',
        started_at: '2026-09-30T00:00:00Z',
        total: 2,
        sent: 1,
        failed: 1,
      },
    ],
  },
}

describe('ConsentMonitorPage server delivery status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sse.opened.length = 0
    sse.throwOnOpen = false
    useToastStore.getState().dismissAll()
  })

  it('shows queued/processing rows and a progress-mode bulk button from server state', async () => {
    vi.mocked(consentService.getFlat).mockResolvedValue(activeResponse)

    render(<ConsentMonitorPage />)
    await flush()

    const queuedLabel = i18n.t('admin.status.queued')
    const processingLabel = i18n.t('admin.status.processing')

    const queuedBtn = screen.getByRole('button', { name: queuedLabel })
    expect(queuedBtn).toBeDisabled()

    const processingBtn = screen.getByRole('button', { name: processingLabel })
    expect(processingBtn).toBeDisabled()

    // No resend/send affordances while the server says queued/processing.
    expect(screen.queryByRole('button', { name: i18n.t('admin.consent.resend') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('admin.consent.send') })).not.toBeInTheDocument()

    // Bulk button reflects SERVER activity (active_batches non-empty).
    const bulk = screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })
    expect(bulk).toBeDisabled()

    expect(consentService.getFlat).toHaveBeenCalledTimes(1)
    // One SSE subscription per active batch.
    expect(sse.opened).toHaveLength(1)
    expect(sse.opened[0].path).toContain('batch_id=batch-1')
  })

  it('refetches on SSE done and shows terminal rows as "Kirim Ulang"', async () => {
    vi.mocked(consentService.getFlat)
      .mockResolvedValueOnce(activeResponse)
      .mockResolvedValueOnce(terminalResponse)

    render(<ConsentMonitorPage />)
    await flush()

    // Simulate the batch reporting done over the existing SSE stream.
    await act(async () => {
      sse.opened[0].fire('done', { sent: 1, failed: 1, total: 2 })
    })
    await flush()

    // Done for all batches → flat refetched; terminal overlay wins.
    expect(consentService.getFlat).toHaveBeenCalledTimes(2)
    expect(consentService.getFlat).toHaveBeenLastCalledWith()

    const resendLabel = i18n.t('admin.consent.resend')
    const resendBtns = screen.getAllByRole('button', { name: resendLabel })
    expect(resendBtns).toHaveLength(2)
    resendBtns.forEach((btn) => expect(btn).toBeEnabled())

    expect(screen.queryByRole('button', { name: i18n.t('admin.status.queued') })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('admin.status.processing') })).not.toBeInTheDocument()

    // Idle again on the server → bulk button back to enabled.
    const bulk = screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })
    expect(bulk).toBeEnabled()

    // Completion observed via SSE `done` + terminal rows → NOT an interruption.
    expect(
      useToastStore.getState().toasts.filter(
        (t) => t.message === i18n.t('admin.status.operationInterrupted'),
      ),
    ).toHaveLength(0)
  })

  it('discards everything on unmount and rediscovers server state on a fresh mount', async () => {
    vi.mocked(consentService.getFlat).mockResolvedValue(activeResponse)

    const first = render(<ConsentMonitorPage />)
    await flush()
    expect(screen.getByRole('button', { name: i18n.t('admin.status.processing') })).toBeInTheDocument()

    first.unmount()

    // Fresh mount with an active server response again — no local persistence
    // carried over, yet the processing row is shown purely from refetched state.
    render(<ConsentMonitorPage />)
    await flush()
    expect(screen.getByRole('button', { name: i18n.t('admin.status.processing') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('admin.status.queued') })).toBeInTheDocument()
    expect(consentService.getFlat).toHaveBeenCalledTimes(2)
  })

  it('stream error AFTER a successful open activates the 3s flat fallback with exactly one warn', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(consentService.getFlat).mockResolvedValue(activeResponse)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0) // EventSource reports open
        })
        await act(async () => {
          sse.opened[0].error() // …then the connection drops mid-stream
        })

        const fallbackWarns = () =>
          warn.mock.calls.filter(
            (c) =>
              c[0] ===
              '[useConsentMonitor] SSE progress stream unavailable — polling /api/consent/flat every 3s while batches are active',
          )
        expect(fallbackWarns()).toHaveLength(1)

        // Flat polling every 3s while batches remain active.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(consentService.getFlat).toHaveBeenCalledTimes(2)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(consentService.getFlat).toHaveBeenCalledTimes(3)
        // ONE warn across all ticks — not one per poll.
        expect(fallbackWarns()).toHaveLength(1)

        // State still renders from the polls — nothing silent, no error UI.
        expect(screen.getByRole('button', { name: i18n.t('admin.status.queued') })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })).toBeDisabled()
        expect(screen.queryByText(i18n.t('admin.consent.loadError'))).toBeNull()
      } finally {
        warn.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('open failure (EventSource construction throws) falls back to polling and renders server state', async () => {
    vi.useFakeTimers()
    try {
      sse.throwOnOpen = true
      vi.mocked(consentService.getFlat).mockResolvedValue(activeResponse)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { })

        // Caught with context (never an uncaught crash, never silent) …
        expect(warn).toHaveBeenCalledWith(
          '[useConsentProgress] failed to open progress stream for batch',
          'batch-1',
          expect.any(Error),
        )
        // … and the monitor's polling fallback takes over.
        expect(warn).toHaveBeenCalledWith(
          '[useConsentMonitor] SSE progress stream unavailable — polling /api/consent/flat every 3s while batches are active',
        )
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(consentService.getFlat).toHaveBeenCalledTimes(2)
        expect(screen.getByRole('button', { name: i18n.t('admin.status.queued') })).toBeInTheDocument()
      } finally {
        warn.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('active_batches vanishing before completion → one-shot interruption toast + confirm refetch', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.mocked(consentService.getFlat).mockImplementation(() => {
        calls++
        if (calls === 3) {
          // Delayed confirm refetch — resolves OUTSIDE the 3s dedupe window,
          // so a double-fire would surface as a second toast and fail here.
          const { promise, resolve } = Promise.withResolvers<ConsentFlatResult>()
          setTimeout(() => resolve(interruptedResponse), 5000)
          return promise
        }
        return Promise.resolve(calls === 1 ? activeResponse : interruptedResponse)
      })

      render(<ConsentMonitorPage />)
      await act(async () => { })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0) // stream opens
      })
      // Server state changed with no `done` → progress event triggers refetch.
      await act(async () => {
        sse.opened[0].fire('progress', { sent: 1, failed: 0, total: 2 })
      })
      await act(async () => { })

      const interrupted = () =>
        useToastStore.getState().toasts.filter(
          (t) => t.message === i18n.t('admin.status.operationInterrupted'),
        )
      expect(interrupted()).toHaveLength(1)
      expect(interrupted()[0].type).toBe('warning')
      // Confirm refetch already invoked; only its RESOLUTION is delayed.
      expect(consentService.getFlat).toHaveBeenCalledTimes(3)

      // Clear dedupe, then let the delayed confirm refetch resolve.
      useToastStore.getState().dismissAll()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(consentService.getFlat).toHaveBeenCalledTimes(3)
      // Second observation of the empty flags → NO repeated notice (one-shot).
      expect(interrupted()).toHaveLength(0)

      // Polling idle (flags gone) — no extra fetches later.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })
      expect(consentService.getFlat).toHaveBeenCalledTimes(3)
      // Server state still renders (bulk no longer shows active batches).
      expect(screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fallback poll failure warns with context, keeps last known state, recovers next tick', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.mocked(consentService.getFlat).mockImplementation(() => {
        calls++
        if (calls === 2) return Promise.reject(new Error('network down'))
        return Promise.resolve(activeResponse)
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        await act(async () => {
          sse.opened[0].error()
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        // Failure surfaced with context — not swallowed.
        expect(warn).toHaveBeenCalledWith(
          '[useConsentMonitor] background flat refresh failed',
          expect.any(Error),
        )
        // Last known state retained; no error screen for a transient failure.
        expect(screen.getByRole('button', { name: i18n.t('admin.status.queued') })).toBeInTheDocument()
        expect(screen.queryByText(i18n.t('admin.consent.loadError'))).toBeNull()

        // Next tick recovers and polling keeps running.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })
        expect(consentService.getFlat).toHaveBeenCalledTimes(3)
        expect(
          warn.mock.calls.filter(
            (c) =>
              c[0] ===
              '[useConsentMonitor] SSE progress stream unavailable — polling /api/consent/flat every 3s while batches are active',
          ),
        ).toHaveLength(1)
      } finally {
        warn.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('flat endpoint 404 stops the fallback poll and shows the existing error UI once (no error-loop)', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.mocked(consentService.getFlat).mockImplementation(() => {
        calls++
        if (calls === 1) return Promise.resolve(activeResponse)
        return Promise.reject(new ApiError('not found', 'not_found', 404))
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })
        await act(async () => {
          sse.opened[0].error()
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })

        expect(warn).toHaveBeenCalledWith(
          '[useConsentMonitor] flat endpoint returned 404; halting fallback polling',
          expect.any(ApiError),
        )
        // Existing error UI (message + Retry) — same path as a failed first load.
        expect(screen.getByText(i18n.t('admin.consent.loadError'))).toBeInTheDocument()
        expect(screen.getByRole('button', { name: i18n.t('common.error.retry') })).toBeInTheDocument()

        // Polling halted for good — no error-loop against the dead endpoint.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(9000)
        })
        expect(consentService.getFlat).toHaveBeenCalledTimes(2)
        expect(
          useToastStore.getState().toasts.filter(
            (t) => t.message === i18n.t('admin.status.operationInterrupted'),
          ),
        ).toHaveLength(0)
      } finally {
        warn.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('SSE done + server-retained terminal batch → bulk button stops the spinner and returns to idle', async () => {
    vi.mocked(consentService.getFlat)
      .mockResolvedValueOnce(activeResponse)
      .mockResolvedValue(retainedTerminalResponse)

    render(<ConsentMonitorPage />)
    await flush()

    const sendAllLabel = i18n.t('admin.consent.sendAll')
    const before = screen.getByRole('button', { name: sendAllLabel })
    expect(before).toBeDisabled()
    expect(before.querySelector('.animate-spin')).not.toBeNull()

    // The server reports the batch finished over the existing SSE stream…
    await act(async () => {
      sse.opened[0].fire('done', { sent: 1, failed: 1, total: 2 })
    })
    await flush()

    // …and the confirming refetch STILL carries the retained completed batch:
    // the counters (sent+failed === total), not mere presence, stop the
    // progress circular and return the button to its normal state.
    expect(consentService.getFlat).toHaveBeenCalledTimes(2)
    const after = screen.getByRole('button', { name: sendAllLabel })
    expect(after).toBeEnabled()
    expect(after.querySelector('.animate-spin')).toBeNull()
    // Rows flip back to "Kirim Ulang" from the same retained server state.
    expect(screen.getAllByRole('button', { name: i18n.t('admin.consent.resend') })).toHaveLength(2)
    // No error surfaced — this was a clean terminal report.
    expect(screen.queryByText(i18n.t('admin.consent.loadError'))).toBeNull()
  })

  it('reopening after completion renders an idle bulk button straight from retained terminal state', async () => {
    vi.mocked(consentService.getFlat).mockResolvedValue(retainedTerminalResponse)

    render(<ConsentMonitorPage />)
    await flush()

    const bulk = screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })
    expect(bulk).toBeEnabled()
    expect(bulk.querySelector('.animate-spin')).toBeNull()
    // Server already says every batch is terminal — one clean check, no
    // status-check retries or fallback polls fire.
    expect(consentService.getFlat).toHaveBeenCalledTimes(1)
    // Terminal rows offer "Kirim Ulang" immediately.
    expect(screen.getAllByRole('button', { name: i18n.t('admin.consent.resend') })).toHaveLength(2)
  })

  it('failed final status checks: bounded retries with logs, surfaced stop, recovery only via server truth', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      vi.mocked(consentService.getFlat).mockImplementation(() => {
        calls++
        if (calls === 1) return Promise.resolve(activeResponse)
        // The confirming check after SSE `done` and every retry keep failing…
        if (calls <= 6) return Promise.reject(new Error('status check down'))
        // …until the manual Retry gets a clean, terminal server response.
        return Promise.resolve(retainedTerminalResponse)
      })
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => { })
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })

        const sendAllLabel = i18n.t('admin.consent.sendAll')
        expect(screen.getByRole('button', { name: sendAllLabel })).toBeDisabled()

        // Server reports done; the confirming status check FAILS.
        await act(async () => {
          sse.opened[0].fire('done', { sent: 1, failed: 1, total: 2 })
        })
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })

        // Failure surfaced with context — never silent.
        expect(warn).toHaveBeenCalledWith(
          '[useConsentMonitor] background flat refresh failed',
          expect.any(Error),
        )
        // Spinner persists while retries run — a check result, not a timeout,
        // decides the button state.
        const during = screen.getByRole('button', { name: sendAllLabel })
        expect(during).toBeDisabled()
        expect(during.querySelector('.animate-spin')).not.toBeNull()
        expect(
          useToastStore.getState().toasts.filter((t) => t.type === 'error'),
        ).toHaveLength(0)

        // Four more failed checks → five consecutive failures hit the cap.
        for (let i = 0; i < 4; i++) {
          await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        }
        expect(consentService.getFlat).toHaveBeenCalledTimes(6)

        // Cap: the progress circular STOPPED (never endless) and the failure
        // is surfaced as message + log + error toast — but the button is NOT
        // idle-normal: it waits for a server-confirmed state.
        const capped = screen.getByRole('button', { name: sendAllLabel })
        expect(capped.querySelector('.animate-spin')).toBeNull()
        expect(capped).toBeDisabled()
        expect(screen.getByText(i18n.t('admin.consent.loadError'))).toBeInTheDocument()
        expect(errorLog).toHaveBeenCalledWith(
          '[useConsentMonitor] consent status check failed repeatedly — stopping bulk-send progress until a clean server response arrives',
        )
        expect(
          useToastStore.getState().toasts.filter(
            (t) => t.type === 'error' && t.message === i18n.t('admin.consent.loadError'),
          ),
        ).toHaveLength(1)

        // Auto-retries are BOUND at the cap — no endless polling either.
        await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
        expect(consentService.getFlat).toHaveBeenCalledTimes(6)

        // Manual Retry resumes the status check; a clean server response with
        // the retained terminal batch restores the idle button — server-
        // confirmed "done", not a timeout guess.
        await act(async () => {
          screen.getByRole('button', { name: i18n.t('common.error.retry') }).click()
        })
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })
        expect(consentService.getFlat).toHaveBeenCalledTimes(7)
        const recovered = screen.getByRole('button', { name: sendAllLabel })
        expect(recovered).toBeEnabled()
        expect(recovered.querySelector('.animate-spin')).toBeNull()
        expect(screen.queryByText(i18n.t('admin.consent.loadError'))).toBeNull()
      } finally {
        warn.mockRestore()
        errorLog.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('invalid status-check payload: logged, spinner bounded, capped into a surfaced error state', async () => {
    vi.useFakeTimers()
    try {
      const malformedResponse = {
        items: [makeItem({ participant_id: 'p1' }), makeItem({ participant_id: 'p2' })],
        extras: { active_batches: 'bogus' },
      } as unknown as ConsentFlatResult
      vi.mocked(consentService.getFlat).mockResolvedValue(malformedResponse)
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => { })
      try {
        render(<ConsentMonitorPage />)
        await act(async () => { await vi.advanceTimersByTimeAsync(0) })

        // Invalid server response is surfaced with a log and holds the
        // spinner — it must never read as "semua selesai"…
        expect(errorLog).toHaveBeenCalledWith(
          '[useConsentMonitor] malformed active_batches payload in flat response',
          'bogus',
        )
        const before = screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })
        expect(before).toBeDisabled()
        expect(before.querySelector('.animate-spin')).not.toBeNull()

        // …and repeated invalid checks are BOUND: five total → capped state.
        for (let i = 0; i < 4; i++) {
          await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        }
        expect(consentService.getFlat).toHaveBeenCalledTimes(5)

        const capped = screen.getByRole('button', { name: i18n.t('admin.consent.sendAll') })
        expect(capped.querySelector('.animate-spin')).toBeNull()
        expect(capped).toBeDisabled()
        expect(screen.getByText(i18n.t('admin.consent.loadError'))).toBeInTheDocument()
        expect(errorLog).toHaveBeenCalledWith(
          '[useConsentMonitor] consent status check failed repeatedly — stopping bulk-send progress until a clean server response arrives',
        )
        expect(
          useToastStore.getState().toasts.filter(
            (t) => t.type === 'error' && t.message === i18n.t('admin.consent.loadError'),
          ),
        ).toHaveLength(1)

        // No endless retries past the cap.
        await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
        expect(consentService.getFlat).toHaveBeenCalledTimes(5)
      } finally {
        errorLog.mockRestore()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('malformed envelope from the flat list surfaces the existing error UI (no blank screen, no retry loop)', async () => {
    vi.mocked(consentService.getFlat).mockRejectedValue(
      new ApiError('unexpected response body', 'unexpected_response', 502),
    )

    render(<ConsentMonitorPage />)
    await flush()

    expect(screen.getByText(i18n.t('admin.consent.loadError'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('common.error.retry') })).toBeInTheDocument()
    // No auto-retry loop against a malformed backend.
    expect(consentService.getFlat).toHaveBeenCalledTimes(1)
  })
})
