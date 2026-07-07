const BACKEND_ENABLED_KEY = 'kidversa_backend_enabled'

export function isBackendEnabled(): boolean {
  return localStorage.getItem(BACKEND_ENABLED_KEY) === 'true'
}

export function setBackendEnabled(enabled: boolean): void {
  localStorage.setItem(BACKEND_ENABLED_KEY, String(enabled))
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
}

export async function healthCheck(): Promise<boolean> {
  if (!isBackendEnabled()) return false
  
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

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  if (!isBackendEnabled()) {
    throw new Error('Backend is not enabled')
  }

  const url = `${getApiBaseUrl()}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = sessionStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`API Error: ${response.status} - ${error}`)
  }

  return response.json()
}

export const backendClient = {
  isBackendEnabled,
  setBackendEnabled,
  getApiBaseUrl,
  healthCheck,
  request: apiRequest,
}
