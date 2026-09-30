import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// Keep the real ApiError class (friendlyError and callers do instanceof
// checks) while replacing only the transport.
vi.mock('@/core/services/backend-client', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, apiRequest: vi.fn() }
})

import { apiRequest, ApiError } from '@/core/services/backend-client'
import {
  listRequest,
  arrayRequest,
  itemsRequest,
  itemsWithExtrasRequest,
  itemRequest,
  nullableItemRequest,
} from '@/core/services/api-envelope'

const mockedRequest = vi.mocked(apiRequest)

const NETWORK_FAULT = 'Terjadi kesalahan. Silakan coba lagi.'

describe('api-envelope: malformed envelope never renders as data (no crash, no fake empty)', () => {
  let errorSpy: MockInstance

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('listRequest rejects with unexpected_response when the body is not an envelope', async () => {
    mockedRequest.mockResolvedValue({} as never)

    await expect(listRequest('/api/things')).rejects.toMatchObject({
      code: 'unexpected_response',
      status: 502,
      message: NETWORK_FAULT,
    })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('listRequest rejects when data exists but is not an array', async () => {
    mockedRequest.mockResolvedValue({ data: 'garbage', meta: { page: 1, limit: 25, total: 1 } } as never)

    await expect(listRequest('/api/things')).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })

  it('listRequest still flattens a valid envelope into the pagination contract', async () => {
    mockedRequest.mockResolvedValue({
      data: [{ id: 'a', tenant_id: null }],
      meta: { page: 1, limit: 25, total: 30 },
    } as never)

    const res = await listRequest('/api/things', { page: 1 })
    expect(res).toEqual({
      data: [{ id: 'a', tenant_id: '' }],
      total: 30,
      page: 1,
      limit: 25,
      totalPages: 2,
    })
  })

  it('arrayRequest rejects a non-envelope body but treats a null list as empty', async () => {
    mockedRequest.mockResolvedValueOnce({} as never)
    await expect(arrayRequest('GET', '/api/groups')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    // nil slice marshals to null — a legitimate empty list, not a fault
    mockedRequest.mockResolvedValueOnce({ data: null } as never)
    await expect(arrayRequest('GET', '/api/groups')).resolves.toEqual([])

    // data present but not a list is still a fault
    mockedRequest.mockResolvedValueOnce({ data: { id: 'a' } } as never)
    await expect(arrayRequest('GET', '/api/groups')).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })

  it('itemsRequest rejects missing/non-list items but treats null items as empty', async () => {
    mockedRequest.mockResolvedValueOnce({} as never)
    await expect(itemsRequest('GET', '/api/reports')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    mockedRequest.mockResolvedValueOnce({ data: {} } as never)
    await expect(itemsRequest('GET', '/api/reports')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    mockedRequest.mockResolvedValueOnce({ data: { items: null } } as never)
    await expect(itemsRequest('GET', '/api/reports')).resolves.toEqual([])

    mockedRequest.mockResolvedValueOnce({ data: { items: [{ id: 'r1' }] } } as never)
    await expect(itemsRequest('GET', '/api/reports')).resolves.toEqual([{ id: 'r1' }])
  })

  it('itemsWithExtrasRequest preserves sibling top-level fields alongside normalized items', async () => {
    mockedRequest.mockResolvedValueOnce({
      data: {
        items: [{ id: 'b1', tenant_id: null }, { id: 'b2' }],
        active_batches: 3,
        active_send: { job_id: 'j-9' },
      },
    } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).resolves.toEqual({
      items: [{ id: 'b1', tenant_id: '' }, { id: 'b2' }],
      extras: { active_batches: 3, active_send: { job_id: 'j-9' } },
    })
    // `items` itself must not leak into extras
    mockedRequest.mockResolvedValueOnce({ data: { items: [] } } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).resolves.toEqual({
      items: [],
      extras: {},
    })
  })

  it('itemsWithExtrasRequest throws on malformed data or missing/non-list items', async () => {
    // no envelope at all
    mockedRequest.mockResolvedValueOnce({} as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).rejects.toMatchObject({
      code: 'unexpected_response',
      status: 502,
      message: NETWORK_FAULT,
    })

    // data present but no `items` key
    mockedRequest.mockResolvedValueOnce({ data: { active_batches: 1 } } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    // items present but not a list
    mockedRequest.mockResolvedValueOnce({ data: { items: 'nope' } } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    // nil data / nil items are legitimate empties, not faults
    mockedRequest.mockResolvedValueOnce({ data: null } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).resolves.toEqual({
      items: [],
      extras: {},
    })

    mockedRequest.mockResolvedValueOnce({ data: { items: null, active_send: false } } as never)
    await expect(itemsWithExtrasRequest('GET', '/api/generate')).resolves.toEqual({
      items: [],
      extras: { active_send: false },
    })
  })

  it('itemRequest rejects a non-envelope body but still passes through 204 (no body)', async () => {
    mockedRequest.mockResolvedValueOnce({} as never)
    await expect(itemRequest('GET', '/api/sessions/s-1')).rejects.toMatchObject({
      code: 'unexpected_response',
    })

    // 204 → apiRequest resolves undefined → undefined, no crash
    mockedRequest.mockResolvedValueOnce(undefined as never)
    await expect(itemRequest('PUT', '/api/sessions/s-1')).resolves.toBeUndefined()

    mockedRequest.mockResolvedValueOnce({ data: { id: 's-1' } } as never)
    await expect(itemRequest('GET', '/api/sessions/s-1')).resolves.toEqual({ id: 's-1' })
  })

  it('nullableItemRequest maps 404 to null, but a malformed body is still a fault', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError('not found', 'not_found', 404))
    await expect(nullableItemRequest('GET', '/api/children/c-1')).resolves.toBeNull()

    mockedRequest.mockRejectedValueOnce(new ApiError('boom', 'internal_error', 500))
    await expect(nullableItemRequest('GET', '/api/children/c-1')).rejects.toMatchObject({
      status: 500,
    })

    mockedRequest.mockResolvedValueOnce({} as never)
    await expect(nullableItemRequest('GET', '/api/children/c-1')).rejects.toMatchObject({
      code: 'unexpected_response',
    })
  })
})
