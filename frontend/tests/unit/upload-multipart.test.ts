import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Mock backend-client BEFORE the import under test ────────────────────
vi.mock('@/core/services/backend-client', () => {
  // ApiError replica — must match the real constructor signature so that
  // `instanceof ApiError` checks in uploadMultipart work at runtime.
  class ApiError extends Error {
    code: string
    status: number
    constructor(message: string, code: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.code = code
      this.status = status
    }
  }
  return {
    ApiError,
    getTokens: vi.fn(() => ({ accessToken: 'token-xyz' })),
    getApiBaseUrl: () => '',
    refreshAccessToken: vi.fn(),
    fireUnauthorized: vi.fn(),
  }
})

// ── Mock tenant utils ───────────────────────────────────────────────────
vi.mock('@/core/utils/tenant', () => ({
  getActiveTenantId: () => 'tenant-1',
}))

import { uploadMultipart } from '@/core/services/upload-multipart'

// ── XHR mock shape ─────────────────────────────────────────────────────
interface XhrMockInstance {
  open: Mock
  setRequestHeader: Mock
  send: Mock
  upload: Record<string, unknown>
  onload: (() => void) | null
  onerror: (() => void) | null
  ontimeout: (() => void) | null
  onabort: (() => void) | null
  status: number
  responseText: string
  withCredentials: boolean
  timeout: number
}

function createXhrMock(): XhrMockInstance {
  return {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    upload: {},
    onload: null,
    onerror: null,
    ontimeout: null,
    onabort: null,
    status: 0,
    responseText: '',
    withCredentials: false,
    timeout: 0,
  }
}

// ── XMLHttpRequest constructor stub ────────────────────────────────────
// uploadMultipart.ts calls `new XMLHttpRequest()`. We replace the global
// constructor so every `new XHR()` returns our pre-built mock object, letting
// the test synchronously drive onload / onerror / ontimeout.
let xhrMock: XhrMockInstance

function MockXMLHttpRequest() {
  return xhrMock
}

describe('uploadMultipart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    xhrMock = createXhrMock()
    // stubGlobal accepts `unknown` — no type assertion needed here
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets X-Tenant-Id and Authorization headers on the XHR', async () => {
    const formData = new FormData()
    formData.append('file', new File(['hello'], 'frame.png', { type: 'image/png' }))

    const promise = uploadMultipart('/api/frames/upload', formData, {})

    expect(xhrMock.open).toHaveBeenCalledWith('POST', '/api/frames/upload', true)
    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer token-xyz')
    expect(xhrMock.setRequestHeader).toHaveBeenCalledWith('X-Tenant-Id', 'tenant-1')
    expect(xhrMock.send).toHaveBeenCalled()

    xhrMock.status = 200
    xhrMock.responseText = JSON.stringify({
      data: { id: 'f1', file_url: 'http://img.png' },
    })
    xhrMock.onload!()

    const result = await promise
    expect(result).toEqual({ id: 'f1', file_url: 'http://img.png' })
  })

  it('rejects with ApiError and surfaces server message on HTTP error', async () => {
    const formData = new FormData()
    formData.append('file', new File(['hello'], 'frame.png', { type: 'image/png' }))

    const promise = uploadMultipart('/api/frames/upload', formData, {})

    xhrMock.status = 500
    xhrMock.responseText = JSON.stringify({
      error: 'Server error',
      code: 'internal_error',
    })
    xhrMock.onload!()

    await expect(promise).rejects.toThrow('Server error')
  })

  it('surfaces the backend error envelope {code,message} on failure', async () => {
    const formData = new FormData()
    formData.append('file', new File(['hello'], 'frame.png', { type: 'image/png' }))

    const promise = uploadMultipart('/api/frames/upload', formData, {})

    xhrMock.status = 400
    xhrMock.responseText = JSON.stringify({
      error: { code: 'tenant_required', message: 'Tenant aktif belum dipilih' },
    })
    xhrMock.onload!()

    await expect(promise).rejects.toMatchObject({
      message: 'Tenant aktif belum dipilih',
      code: 'tenant_required',
      status: 400,
    })
  })

  it('rejects with network_error on XHR network error', async () => {
    const formData = new FormData()
    formData.append('file', new File(['hello'], 'frame.png', { type: 'image/png' }))

    const promise = uploadMultipart('/api/frames/upload', formData, {})

    xhrMock.onerror!()

    await expect(promise).rejects.toThrow('Network error during upload')
  })
})
