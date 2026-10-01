import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// Capture wire requests without touching the network (same envelope contract
// as SessionGroupsAddParticipant.test.tsx: the real services run on top).
vi.mock('../../src/core/services/api-envelope', () => ({
  itemRequest: vi.fn(async () => ({ id: 'p-new' })),
  arrayRequest: vi.fn(async () => []),
  voidRequest: vi.fn(async () => undefined),
}))

import { SessionGroupsTab } from '../../src/features/admin/components/SessionGroupsTab'
import { participantService } from '../../src/core/services/participants'
import { sessionService } from '../../src/core/services/sessions'
import { ApiError } from '../../src/core/services/backend-client'
import { useToastStore } from '../../src/core/stores/toastStore'

const delay = (ms: number) => {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 4; i++) await delay(10)
  })
}

const groups = [
  {
    id: 'g-a',
    name: 'Kelompok Alpha',
    session_id: 's-1',
    color_code: '#FF0000',
    facilitator_id: null,
    participants: [],
  },
] as never[]

const facilitators = [{ id: 'f-1', name: 'Budi' }] as never[]

const renderTab = (sessionStatus = 'ACTIVE') => {
  const onRefresh = vi.fn()
  const utils = render(
    <MemoryRouter>
      <SessionGroupsTab
        sessionId="s-1"
        sessionStatus={sessionStatus}
        groups={groups}
        facilitators={facilitators}
        onRefresh={onRefresh}
      />
    </MemoryRouter>,
  )
  return { onRefresh, ...utils }
}

const toasts = () => useToastStore.getState().toasts

describe('SessionGroupsTab: facilitator failure rolls back AND toasts (never silent)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    vi.spyOn(participantService, 'getAll').mockResolvedValue({ data: [], total: 0 } as never)
    vi.spyOn(sessionService, 'getLinkableParticipants').mockResolvedValue([] as never)
  })

  it('invalid_facilitator → error toast with the localized message, select reverted', async () => {
    vi.spyOn(sessionService, 'updateGroup').mockRejectedValue(
      new ApiError('Fasilitator tidak valid atau tidak ditemukan', 'invalid_facilitator', 400) as never,
    )
    renderTab('ACTIVE')
    await flush()

    const select = screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Alpha' })
    fireEvent.change(select, { target: { value: 'f-1' } })
    await flush()

    // The error branch must toast (code-driven message), not swallow.
    const errors = toasts().filter((t) => t.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('Fasilitator tidak valid atau tidak ditemukan.')
    // Optimistic override rolled back: the select is empty again.
    expect((screen.getByRole('combobox', { name: 'Fasilitator kelompok Kelompok Alpha' }) as HTMLSelectElement).value).toBe('')
  })
})

describe('SessionGroupsTab: CSV import — skip reasons reported, failures toasted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    vi.spyOn(participantService, 'getAll').mockResolvedValue({ data: [], total: 0 } as never)
    vi.spyOn(sessionService, 'getLinkableParticipants').mockResolvedValue([] as never)
  })

  const runCsvImport = async () => {
    const { onRefresh } = renderTab('DRAFT')
    await flush()
    fireEvent.click(screen.getByText('Import CSV'))
    await flush()

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const csv =
      'child_name,child_age,school_name,parent_name,parent_phone,parent_email,group_name\n' +
      'Citra,7,SD Alpha,Budi,081234567890,,Kelompok Alpha\n' +
      'Rina,8,SD Alpha,Andi,081234567891,,Kelompok Alpha\n'
    const file = new File([csv], 'peserta.csv', { type: 'text/csv' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    fireEvent.change(input)
    await flush()

    fireEvent.click(screen.getByText('Import 2 Peserta'))
    await flush()
    return onRefresh
  }

  it('partial import → ONE warning toast with the per-reason breakdown', async () => {
    vi.spyOn(sessionService, 'importParticipants').mockResolvedValue({
      created: [{ id: 'p-new' }],
      skipped: [
        { participant_id: 'p-1', child_name: 'Dup', parent_phone: '+6281234567890', existing_session: '', reason: 'duplicate' },
        { participant_id: 'p-2', child_name: 'Full1', parent_phone: '+6281234567891', existing_session: '', reason: 'group_full' },
        { participant_id: 'p-3', child_name: 'Full2', parent_phone: '+6281234567892', existing_session: '', reason: 'group_full' },
      ],
    } as never)

    const onRefresh = await runCsvImport()

    const warnings = toasts().filter((t) => t.type === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toBe('1 peserta ditambahkan, 3 dilewati (1 duplikat, 2 kelompok penuh)')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    // Success path: no error toast.
    expect(toasts().filter((t) => t.type === 'error')).toHaveLength(0)
  })

  it('import rejection → error toast carrying the failure cause, no refresh', async () => {
    vi.spyOn(sessionService, 'importParticipants').mockRejectedValue(
      new ApiError('impor gagal di server', 'internal_error', 500) as never,
    )

    const onRefresh = await runCsvImport()

    const errors = toasts().filter((t) => t.type === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('impor gagal di server')
    expect(onRefresh).not.toHaveBeenCalled()
    expect(toasts().filter((t) => t.type === 'warning')).toHaveLength(0)
  })
})
