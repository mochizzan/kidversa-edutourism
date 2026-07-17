// backendClient.ts — single-module HTTP/SSE client for the kidversa backend.
//
// Token + connection state live at module scope (one instance per tab).
//
// AUTHENTICATION MODEL
// --------------------
// - The ACCESS token is held in memory only (module-scoped `accessToken`).
// - The REFRESH token is an HttpOnly cookie set by the backend on /login and
//   /api/auth/refresh. The frontend CANNOT set HttpOnly cookies, so
//   `setTokens()` stores only the access token and intentionally ignores the
//   `refresh` argument — the refresh cookie is owned by the backend.
// - The authenticated user object is persisted to sessionStorage (see
//   setStoredUser/getStoredUser) so the auth store can rehydrate without a
//   round-trip. It is typed as `unknown` here because the user entity is
//   defined elsewhere.
// - SSE uses a separate cookie (`kidversa_session`); EventSource cannot send
//   an Authorization header, so openSSE relies on `withCredentials: true`.

import { API_ROUTES } from '../constants/apiRoutes'

export type ConnectionState = 'online' | 'degraded' | 'reconnecting'

const USER_STORAGE_KEY = 'kidversa_user'
const AUTH_CHANNEL = 'kidversa-auth'

// ---------------------------------------------------------------------------
// Token + user storage
// ---------------------------------------------------------------------------

let accessToken: string | null = null

export function getTokens(): { accessToken: string | null } {
  return { accessToken }
}

export function setTokens(access: string | null, _refresh?: string): void {
  // The refresh token is expected to live in an HttpOnly cookie set by the
  // backend; we intentionally do not store it here. We keep the parameter for
  // API compatibility with callers that pass both tokens.
  accessToken = access
}

export function clearTokens(): void {
  accessToken = null
  clearStoredUser()
}

export function setStoredUser(user: unknown): void {
  try {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
  } catch {
    // sessionStorage may be unavailable (e.g. private mode); ignore.
  }
}

export function getStoredUser<T = unknown>(): T | null {
  try {
    const raw = sessionStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function clearStoredUser(): void {
  sessionStorage.removeItem(USER_STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// Centralized 401 handler registry
// ---------------------------------------------------------------------------

// Registry handler 401 terpusat. App mendaftarkan navigator SPA; kalau
// kosong, fallback hard redirect. Tanpa import authStore (hindari circular).
let unauthorizedHandler: (() => void) | null = null

export function registerUnauthorizedHandler(fn: () => void): void {
  unauthorizedHandler = fn
}

export function fireUnauthorized(): void {
  if (unauthorizedHandler) unauthorizedHandler()
  else window.location.assign('/auth/login')
}

// ---------------------------------------------------------------------------
// Typed API error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  code: string
  status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// Connection store (module-level state + listener set)
// ---------------------------------------------------------------------------

let connection: ConnectionState = 'online'
const connectionListeners = new Set<(s: ConnectionState) => void>()

export function getConnection(): ConnectionState {
  return connection
}

export function setConnection(state: ConnectionState): void {
  if (connection === state) return
  connection = state
  connectionListeners.forEach((cb) => cb(state))
}

export function subscribeConnection(cb: (s: ConnectionState) => void): () => void {
  connectionListeners.add(cb)
  cb(connection)
  return () => {
    connectionListeners.delete(cb)
  }
}

// ---------------------------------------------------------------------------
// Base URL + health
// ---------------------------------------------------------------------------

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Request options + low-level fetch
// ---------------------------------------------------------------------------

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(1000 * 2 ** (attempt - 1), 8000)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function toApiError(response: Response): Promise<ApiError> {
  let message = 'Terjadi kesalahan. Silakan coba lagi.'
  let code = 'unknown'
  try {
    const data = await response.json()
    if (data && typeof data === 'object') {
      // Backend envelope: { error: { code: string, message: string } }
      const errObj = (data as Record<string, unknown>).error
      if (errObj && typeof errObj === 'object') {
        const e = errObj as Record<string, unknown>
        if (typeof e.code === 'string') code = e.code
        if (typeof e.message === 'string') message = e.message
      } else if (typeof errObj === 'string') {
        message = errObj
      }
    }
  } catch {
    // Non-JSON error body; keep the defaults.
  }
  return new ApiError(message, code, response.status)
}

// ---------------------------------------------------------------------------
// Token refresh — single-flight per tab + cross-tab lock
// ---------------------------------------------------------------------------

let refreshing: Promise<string> | null = null
let remoteRefreshing = false

// BroadcastChannel is used to coordinate refreshes across tabs. If it is
// unavailable (older environments), we degrade to per-tab single-flight only.
let authChannel: BroadcastChannel | null = null
try {
  if (typeof BroadcastChannel !== 'undefined') {
    authChannel = new BroadcastChannel(AUTH_CHANNEL)
    authChannel.onmessage = (ev: MessageEvent) => {
      const data = ev.data
      if (data && typeof data === 'object') {
        if (data.type === 'refresh:start') remoteRefreshing = true
        else if (data.type === 'refresh:end') remoteRefreshing = false
      }
    }
  }
} catch {
  authChannel = null
}

function waitForRemoteRefresh(timeoutMs = 10000): Promise<string | null> {
  return new Promise((resolve) => {
    if (!authChannel) return resolve(null)
    const timer = setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data
      if (data && typeof data === 'object' && data.type === 'refresh:end') {
        cleanup()
        resolve(typeof data.token === 'string' ? data.token : accessToken)
      }
    }
    const cleanup = () => {
      clearTimeout(timer)
      authChannel?.removeEventListener('message', onMessage)
    }
    authChannel.addEventListener('message', onMessage)
  })
}

export async function refreshAccessToken(): Promise<string> {
  // Single-flight: reuse an in-flight refresh within this tab.
  if (refreshing) return refreshing

  // Another tab is already refreshing — piggyback on its result.
  if (authChannel && remoteRefreshing) {
    const token = await waitForRemoteRefresh()
    if (token) {
      accessToken = token
      return token
    }
    // Timeout / no token returned: fall through to our own refresh.
  }

  const refreshPromise = (async (): Promise<string> => {
    authChannel?.postMessage({ type: 'refresh:start' })
    try {
      const res = await fetch(`${getApiBaseUrl()}${API_ROUTES.AUTH.REFRESH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) {
        // Refresh failed — drop tokens so the auth store can redirect to login.
        clearTokens()
        let code = 'refresh_failed'
        let message = 'Session expired. Please log in again.'
        try {
          const data = await res.json()
          const errPayload = data?.error ?? data
          if (typeof errPayload?.message === 'string') message = errPayload.message
          if (typeof errPayload?.code === 'string') code = errPayload.code
        } catch {
          // Ignore non-JSON body.
        }
        throw new ApiError(message, code, res.status)
      }
      // Backend sets the HttpOnly refresh cookie and returns a fresh access token.
      const data = await res.json()
      const payload = data.data ?? data
      const newToken: string = payload.access_token ?? payload.accessToken ?? ''
      if (!newToken) {
        throw new ApiError('No access token returned', 'refresh_failed', res.status)
      }
      accessToken = newToken
      return newToken
    } finally {
      authChannel?.postMessage({ type: 'refresh:end', token: accessToken })
    }
  })()

  refreshing = refreshPromise
  try {
    return await refreshPromise
  } finally {
    refreshing = null
  }
}

// ---------------------------------------------------------------------------
// Generic API request
// ---------------------------------------------------------------------------

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  const MAX_RETRIES = 3
  let attempt = 0
  let didRefresh = false

  const doFetch = async (): Promise<Response> => {
    const url = `${getApiBaseUrl()}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(opts?.headers ?? {}),
    }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    return fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: opts?.signal,
    })
  }

  while (true) {
    let response: Response
    try {
      response = await doFetch()
    } catch (err) {
      // Network / connection failure — mark down and retry with backoff.
      setConnection('reconnecting')
      if (++attempt > MAX_RETRIES) {
        throw err instanceof Error ? err : new Error('Network request failed')
      }
      await backoff(attempt)
      continue
    }

    if (response.status === 401) {
      // Coba refresh bila kita yakin ada sesi aktif. Sinyal yang aman:
      // user tersimpan di sessionStorage ⇒ refresh cookie (milik backend,
      // HttpOnly) kemungkinan masih valid. Setelah reload accessToken memang
      // null, tapi cookie refresh tetap ada, sehingga refresh HARUS dicoba
      // (bukan langsung throw). Untuk request anonim (tidak ada storedUser)
      // kita langsung throw — tidak ada sesi untuk di-refresh.
      if (!didRefresh && getStoredUser()) {
        didRefresh = true
        const ok = await refreshAccessToken().then(
          () => true,
          () => false,
        )
        if (ok) continue
      }
      // Refresh gagal (atau memang belum login) — arahkan ke login lalu lempar.
      fireUnauthorized()
      throw await toApiError(response)
    }

    if (!response.ok) {
      throw await toApiError(response)
    }

    setConnection('online')
    if (response.status === 204) {
      return undefined as T
    }
    return (await response.json()) as T
  }
}

// ---------------------------------------------------------------------------
// Server-Sent Events (cookie-authenticated)
// ---------------------------------------------------------------------------

export interface SSEOptions {
  onError?: (event: Event) => void
}

export function openSSE(
  path: string,
  onEvent: (event: MessageEvent) => void,
  opts?: SSEOptions,
): EventSource {
  const base = `${getApiBaseUrl()}${path}`
  // EventSource cannot send an Authorization header; it relies on the
  // `kidversa_session` cookie being sent via withCredentials. As a fallback
  // for cross-origin environments where that cookie may be dropped, append
  // the access token as a query parameter — the backend's JWTAuth middleware
  // checks the cookie first, then falls back to ?token=.
  const separator = path.includes('?') ? '&' : '?'
  const url = accessToken
    ? `${base}${separator}token=${encodeURIComponent(accessToken)}`
    : base
  const source = new EventSource(url, { withCredentials: true })
  source.onmessage = onEvent
  source.onerror = (ev) => {
    opts?.onError?.(ev)
  }
  return source
}

// ---------------------------------------------------------------------------
// Connection watcher
// ---------------------------------------------------------------------------

let connectionTimer: ReturnType<typeof setInterval> | null = null

export function stopConnectionWatcher(): void {
  if (connectionTimer !== null) {
    clearInterval(connectionTimer)
    connectionTimer = null
  }
}

export function startConnectionWatcher(intervalMs = 15000): () => void {
  // Avoid duplicate watchers in the same tab.
  if (connectionTimer !== null) {
    return stopConnectionWatcher
  }
  const tick = async () => {
    const ok = await healthCheck()
    setConnection(ok ? 'online' : 'degraded')
  }
  void tick()
  connectionTimer = setInterval(tick, intervalMs)
  return stopConnectionWatcher
}

// ---------------------------------------------------------------------------
// Public client object
// ---------------------------------------------------------------------------

export const backendClient = {
  getApiBaseUrl,
  healthCheck,
  request: apiRequest,
  refreshAccessToken,
  openSSE,
  getTokens,
  setTokens,
  clearTokens,
  startConnectionWatcher,
  stopConnectionWatcher,
  getConnection,
  setConnection,
  subscribeConnection,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
}
