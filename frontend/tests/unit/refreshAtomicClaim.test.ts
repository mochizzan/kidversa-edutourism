import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * refreshAccessToken cross-tab atomic claim (F-B-002 / AR-6 FE).
 *
 * backend-client binds its BroadcastChannel at module import, so every case
 * re-imports the module fresh (vi.resetModules) behind a deterministic
 * in-memory BroadcastChannel fake. Two fresh imports = two tabs (separate
 * per-tab single-flight and holder ids, shared locks/fetch/claim storage).
 *
 * Contention is sequenced on the same tick — no wall-clock sleeps: the
 * holder's REFRESH POST is a gate the test releases, and contender calls are
 * issued while that gate is shut so ordering is deterministic.
 */

type FetchArgs = [input: string | URL | Request, init?: RequestInit]

const REFRESH_URL = '/api/auth/refresh'

function okRefresh(token: string): Response {
 return {
  ok: true,
  status: 200,
  json: async () => ({ data: { access_token: token } }),
 } as Response
}

function isRefreshPost(args: FetchArgs): boolean {
 const [url, init] = args
 return url === REFRESH_URL && init?.method === 'POST'
}

/** In-memory BroadcastChannel: same-name instances hear each other. */
class FakeBroadcastChannel {
 static buses: Record<string, Array<(ev: { data: unknown }) => void>> = {}

 private listeners: Array<(ev: { data: unknown }) => void> = []
 onmessage: ((ev: { data: unknown }) => void) | null = null

 constructor(readonly name: string) {
  FakeBroadcastChannel.buses[name] ??= []
 }

 addEventListener(_type: string, cb: (ev: { data: unknown }) => void): void {
  FakeBroadcastChannel.buses[this.name].push(cb)
  this.listeners.push(cb)
 }

 removeEventListener(_type: string, cb: (ev: { data: unknown }) => void): void {
  FakeBroadcastChannel.buses[this.name] = FakeBroadcastChannel.buses[this.name].filter(
   (entry) => entry !== cb,
  )
  this.listeners = this.listeners.filter((entry) => entry !== cb)
 }

 postMessage(data: unknown): void {
  const ev = { data }
  for (const cb of [...FakeBroadcastChannel.buses[this.name]]) {
   queueMicrotask(() => cb(ev))
  }
  queueMicrotask(() => this.onmessage?.(ev))
 }

 close(): void {
  for (const cb of this.listeners) this.removeEventListener('message', cb)
  this.onmessage = null
 }
}

/** Pending-refresh gate: the REFRESH POST waits until the test releases it. */
function refreshGate() {
 const { promise, resolve } = Promise.withResolvers<Response>()
 const fetchMock = vi.fn((...args: FetchArgs): Promise<Response> => {
  const [url] = args
  if (url === REFRESH_URL) return promise
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)
 })
 return { fetchMock, release: (token: string) => resolve(okRefresh(token)) }
}

async function loadClient() {
 return import('@/core/services/backend-client')
}

/** Flush microtasks/queued BroadcastChannel deliveries without real time. */
async function flush(): Promise<void> {
 for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
 vi.resetModules()
 FakeBroadcastChannel.buses = {}
 vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
 localStorage.clear()
 // jsdom has no navigator.locks; each case defines or leaves it absent.
 delete (navigator as { locks?: unknown }).locks
})

afterEach(() => {
 vi.unstubAllGlobals()
 vi.restoreAllMocks()
})

describe('refreshAccessToken atomic claim — concurrent calls share one POST', () => {
 it('same-tab concurrent calls POST once (per-tab single-flight preserved)', async () => {
  const { fetchMock, release } = refreshGate()
  vi.stubGlobal('fetch', fetchMock)

  const { refreshAccessToken } = await loadClient()
  const pending = Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()])
  release('access-new')
  const [a, b, c] = await pending

  expect(a).toBe('access-new')
  expect(b).toBe('access-new')
  expect(c).toBe('access-new')
  expect(fetchMock.mock.calls.filter(isRefreshPost)).toHaveLength(1)
 })

 it('locks holder POSTs while a denied contender piggybacks (single POST total)', async () => {
  // Real-mutex fake: a held lock denies ifAvailable contenders.
  let held = false
  const requestMock = vi.fn(
   async (
    _name: string,
    opts: { ifAvailable?: boolean },
    cb: (lock: object | null) => Promise<string | null>,
   ): Promise<string | null> => {
    if (opts?.ifAvailable && held) return cb(null)
    held = true
    try {
     return await cb({})
    } finally {
     held = false
    }
   },
  )
  Object.defineProperty(navigator, 'locks', { value: { request: requestMock }, configurable: true })

  const { fetchMock, release } = refreshGate()
  vi.stubGlobal('fetch', fetchMock)

  // Two tabs = two module instances (separate per-tab single-flight).
  const tabA = await loadClient()
  vi.resetModules()
  const tabB = await loadClient()

  const pendingA = tabA.refreshAccessToken()
  await flush() // A claims the lock and starts its POST.
  const pendingB = tabB.refreshAccessToken()
  await flush() // B contends while the holder is in flight.

  // Contender never POSTed while the holder was in flight.
  expect(fetchMock.mock.calls.filter(isRefreshPost)).toHaveLength(1)

  release('access-holder')
  const [a, b] = await Promise.all([pendingA, pendingB])

  expect(a).toBe('access-holder')
  expect(b).toBe('access-holder')
  expect(fetchMock.mock.calls.filter(isRefreshPost)).toHaveLength(1)
  expect(requestMock.mock.calls.length).toBeGreaterThanOrEqual(2)
 })

 it('fallback (no navigator.locks): CAS holder POSTs, contender piggybacks — single POST', async () => {
  // navigator.locks left undefined (old WebView) by beforeEach.
  const { fetchMock, release } = refreshGate()
  vi.stubGlobal('fetch', fetchMock)

  const tabA = await loadClient()
  vi.resetModules()
  const tabB = await loadClient()

  const pendingA = tabA.refreshAccessToken()
  await flush() // A holds the localStorage CAS claim.
  expect(localStorage.getItem('kidversa-refresh-claim')).toContain('exp')
  const pendingB = tabB.refreshAccessToken()
  await flush() // B contends while the holder is in flight.

  expect(fetchMock.mock.calls.filter(isRefreshPost)).toHaveLength(1)

  release('access-cas')
  const [a, b] = await Promise.all([pendingA, pendingB])

  expect(a).toBe('access-cas')
  expect(b).toBe('access-cas')
  expect(fetchMock.mock.calls.filter(isRefreshPost)).toHaveLength(1)
 })
})
