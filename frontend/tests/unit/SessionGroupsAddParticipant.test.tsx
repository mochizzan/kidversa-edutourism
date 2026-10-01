import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'

// Avoid real HTTP calls; the participant create path deliberately flows
// through the real participantService into this mocked envelope so the test
// also proves session_id/group_id reach the wire.
vi.mock('../../src/core/services/api-envelope', () => ({
  itemRequest: vi.fn(async () => ({ id: 'p-new' })),
  arrayRequest: vi.fn(async () => []),
  voidRequest: vi.fn(async () => undefined),
}))

import { itemRequest } from '../../src/core/services/api-envelope'
import { SessionGroupsTab } from '../../src/features/admin/components/SessionGroupsTab'
import { participantService } from '../../src/core/services/participants'
import { sessionService } from '../../src/core/services/sessions'
import { ApiError } from '../../src/core/services/backend-client'

// Flush FileReader + async state updates (several macrotask turns).
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
    participants: [
      {
        id: 'p-linked',
        session_id: 's-1',
        group_id: 'g-a',
        child_name: 'Siti',
        child_age: 6,
        school_name: 'SD Alpha',
        parent_name: 'Rina',
        parent_phone: '+628111111111',
      },
    ],
  },
] as never[]

const renderTab = (sessionStatus = 'ACTIVE') => {
  const onRefresh = vi.fn()
  const utils = render(
    <MemoryRouter>
      <SessionGroupsTab
        sessionId="s-1"
        sessionStatus={sessionStatus}
        groups={groups}
        facilitators={[]}
        onRefresh={onRefresh}
      />
    </MemoryRouter>,
  )
  return { onRefresh, ...utils }
}

const openAddParticipantModal = async () => {
  const rendered = renderTab()
  await flush()
  fireEvent.click(screen.getAllByText('Tambah Peserta')[0])
  await flush()
  return rendered
}

const fillNewParticipantForm = () => {
  fireEvent.change(screen.getByPlaceholderText('Contoh: Budi Santoso'), { target: { value: 'Citra Ayu' } })
  fireEvent.change(screen.getByPlaceholderText('Contoh: 6'), { target: { value: '7' } })
  fireEvent.change(screen.getByPlaceholderText('Contoh: Andi Santoso'), { target: { value: 'Budi Santoso' } })
  fireEvent.change(screen.getByPlaceholderText('8123456789'), { target: { value: '8123456789' } })
}

const findCreatedBody = () => {
  const call = vi.mocked(itemRequest).mock.calls.find(
    (c) => c[0] === 'POST' && c[2] && typeof c[2] === 'object' && 'session_id' in (c[2] as Record<string, unknown>),
  )
  return call ? (call[2] as Record<string, unknown>) : undefined
}

describe('SessionGroupsTab — add participant (create-new path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(participantService, 'getAll').mockResolvedValue({ data: [], total: 0 } as never)
    vi.spyOn(sessionService, 'getLinkableParticipants').mockResolvedValue([] as never)
  })

  it('Buat peserta baru submits with session_id + group_id and refreshes', async () => {
    const { onRefresh } = await openAddParticipantModal()

    fireEvent.click(screen.getByText('Buat peserta baru'))
    fillNewParticipantForm()
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }))
    await flush()

    const body = findCreatedBody()
    expect(body, 'POST /api/participants body must carry session_id').toBeTruthy()
    expect(body!.session_id).toBe('s-1')
    expect(body!.group_id).toBe('g-a')
    expect(body!.child_name).toBe('Citra Ayu')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    // Success closes the modal.
    expect(screen.queryByText('Buat peserta baru')).toBeNull()
  })

  it('group_full on create surfaces an inline error, no refresh', async () => {
    vi.mocked(itemRequest).mockImplementationOnce(async () => {
      throw new ApiError('full', 'group_full', 409)
    })
    const { onRefresh } = await openAddParticipantModal()

    fireEvent.click(screen.getByText('Buat peserta baru'))
    fillNewParticipantForm()
    fireEvent.click(screen.getByRole('button', { name: 'Tambah' }))
    await flush()

    expect(screen.getByRole('alert').textContent).toBe('Kelompok sudah penuh (maksimal 20 peserta).')
    expect(onRefresh).not.toHaveBeenCalled()
    // Modal stays open in the data-entry form (back-to-picker action visible).
    expect(screen.getByText('Kembali')).toBeTruthy()
    expect(screen.getByPlaceholderText('Contoh: Budi Santoso')).toBeTruthy()
  })

  it('link path surfaces participant_already_in_session inline, no refresh', async () => {
    vi.spyOn(participantService, 'getAll').mockResolvedValue({
      data: [
        {
          id: 'p-9',
          child_name: 'Anak Baru',
          child_age: 7,
          school_name: 'SD Beta',
          parent_name: 'Budi',
          parent_phone: '+628123456789',
        },
      ],
      total: 1,
    } as never)
    vi.spyOn(sessionService, 'linkParticipant').mockRejectedValue(
      new ApiError('dup', 'participant_already_in_session', 409) as never,
    )
    const { onRefresh } = await openAddParticipantModal()

    fireEvent.click(screen.getByText('Anak Baru'))
    fireEvent.click(screen.getByRole('button', { name: 'Tambahkan' }))
    await flush()

    expect(screen.getByText('Peserta sudah berada di sesi ini.')).toBeTruthy()
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('CSV import success triggers refresh and reports created (not parsed) counts', async () => {
    vi.spyOn(sessionService, 'importParticipants').mockResolvedValue({
      created: [{ id: 'p-new' }],
      skipped: [],
    } as never)

    // The CSV import entry point renders for DRAFT sessions (existing UI gate).
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

    expect(sessionService.importParticipants).toHaveBeenCalledWith(
      's-1',
      expect.arrayContaining([expect.objectContaining({ group_id: 'g-a', child_name: 'Citra' })]),
    )
    expect(onRefresh).toHaveBeenCalledTimes(1)
    // Summary uses the backend's created count (1), not the parsed row count (2).
    expect(screen.getByText('1 peserta berhasil diimpor, 1 grup dibuat.')).toBeTruthy()
  })
})
