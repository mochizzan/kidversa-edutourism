import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { render } from './test-utils'
import type * as ApiEnvelope from '@/core/services/api-envelope'

// Transport-boundary mock: the real programs.ts / program-stages.ts build the
// request body and hand it to itemRequest, so observing that call shows exactly
// what would go on the wire. Every other api-envelope export stays real so the
// whole module graph still links.
vi.mock('@/core/services/api-envelope', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiEnvelope>()
  return {
    ...actual,
    listRequest: vi.fn(),
    arrayRequest: vi.fn(),
    itemRequest: vi.fn(),
    voidRequest: vi.fn(),
    nullableItemRequest: vi.fn(),
  }
})

// Import after the mock is registered.
import TopicFormPage from '@/features/admin/pages/TopicFormPage'
import { itemRequest, listRequest, arrayRequest } from '@/core/services/api-envelope'
import { programStageService } from '@/core/services/program-stages'
import type { ProgramStage } from '@/core/types'

const stage: ProgramStage = {
  id: 'ps1',
  program_id: 'p1',
  sequence_order: 1,
  name: 'Topik Lama',
  description: 'deskripsi lama',
  content_type: 'MIXED',
  created_at: '2026-01-01T00:00:00Z',
} as ProgramStage

type Body = Record<string, unknown>

// Returns the body of the first itemRequest call matching method + URL part.
function findBody(method: string, urlPart: string): Body | undefined {
  const call = vi
    .mocked(itemRequest)
    .mock.calls.find(
      (c: readonly unknown[]) =>
        c[0] === method &&
        typeof c[1] === 'string' &&
        c[1].includes(urlPart) &&
        c[2] !== undefined &&
        typeof c[2] === 'object',
    )
  return call ? (call[2] as Body) : undefined
}

function renderTopic(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/topics/:topicId" element={<TopicFormPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// The page hydrates through a chain of promises (programs list -> stage lookup).
// Settle by waiting until the name field carries the expected value instead of
// guessing a number of microtask ticks.
async function untilNameValue(expected: string) {
  for (let i = 0; i < 40; i++) {
    const input = screen.queryByLabelText('Nama Topik') as HTMLInputElement | null
    if (input && input.value === expected) return
    await act(async () => {
      await Promise.resolve()
    })
  }
  throw new Error(`name field never reached "${expected}"`)
}

async function submitForm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe('stage create/update payload no longer carries is_photo_stage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listRequest).mockResolvedValue({
      data: [{ id: 'p1', name: 'Program Satu' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    } as never)
    vi.mocked(arrayRequest).mockResolvedValue([] as never)
    vi.mocked(itemRequest).mockResolvedValue({ id: 'ps1' } as never)
  })

  it('create: TopicFormPage -> programService.createStage sends no is_photo_stage key', async () => {
    renderTopic('/admin/topics/new?programId=p1')
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.change(screen.getByLabelText('Nama Topik'), { target: { value: 'Topik Baru' } })
    await submitForm()

    const body = findBody('POST', '/api/programs/p1/stages')
    expect(body, 'createStage POST body must be sent').toBeDefined()
    expect(body).not.toHaveProperty('is_photo_stage')
    // Positive control: this really is the stage payload, not an empty object.
    expect(body).toMatchObject({ name: 'Topik Baru', content_type: 'MIXED' })
  })

  it('update: TopicFormPage -> programService.updateStage sends no is_photo_stage key', async () => {
    vi.mocked(arrayRequest).mockResolvedValue([stage] as never)
    renderTopic('/admin/topics/ps1?programId=p1')
    await untilNameValue('Topik Lama')

    fireEvent.change(screen.getByLabelText('Nama Topik'), { target: { value: 'Topik Ubah' } })
    await submitForm()

    const body = findBody('PUT', '/api/programs/p1/stages/ps1')
    expect(body, 'updateStage PUT body must be sent').toBeDefined()
    expect(body).not.toHaveProperty('is_photo_stage')
    expect(body).toMatchObject({ name: 'Topik Ubah', content_type: 'MIXED' })
  })

  it('programStageService: create/update never forward a legacy is_photo_stage key', async () => {
    await programStageService.create({
      program_id: 'p1',
      sequence_order: 1,
      name: 'Topik Baru',
      content_type: 'TEXT',
    })

    const createBody = findBody('POST', '/api/programs/p1/stages')
    expect(createBody, 'create body must be sent').toBeDefined()
    expect(createBody).not.toHaveProperty('is_photo_stage')
    expect(createBody).toMatchObject({ name: 'Topik Baru', content_type: 'TEXT' })

    vi.mocked(arrayRequest).mockResolvedValue([stage] as never)
    // A stale caller may still put the removed key on the DTO — the service
    // must not forward it to the wire.
    const legacyData = {
      program_id: 'p1',
      sequence_order: 2,
      name: 'Topik Diubah',
      content_type: 'TEXT',
      is_photo_stage: true,
    } as unknown as Parameters<typeof programStageService.update>[1]
    await programStageService.update('ps1', legacyData)

    const updateBody = findBody('PUT', '/api/programs/p1/stages/ps1')
    expect(updateBody, 'update body must be sent').toBeDefined()
    expect(updateBody).not.toHaveProperty('is_photo_stage')
    expect(updateBody).toMatchObject({ name: 'Topik Diubah', content_type: 'TEXT' })
  })
})
