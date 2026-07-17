import type { Report } from '../types'
import type { ReportService } from './types'
import { apiRequest, getApiBaseUrl } from './backendClient'
import { itemsRequest, itemRequest, nullableItemRequest, voidRequest } from './apiEnvelope'
import { useAuthStore } from '../stores/authStore'
import { API_ROUTES } from '../constants/apiRoutes'

interface ReportApproveRequest {
  approved_by: string
}

interface ReportTokenResponse {
  id: string
  parent_access_token: string
  token_expires_at?: string | null
  status: string
}

interface PublicReportResponse {
  id: string
  participant_id: string
  session_id: string
  status: string
  ai_narrative_final?: string
  mission_ids?: string[]
  report_pdf_url?: string
}

const getBySession = async (sessionId: string): Promise<Report[]> => {
  return itemsRequest<Report>('GET', API_ROUTES.REPORTS.BY_SESSION(sessionId))
}

const getById = async (id: string): Promise<Report | null> => {
  return nullableItemRequest<Report>('GET', API_ROUTES.REPORTS.DETAIL(id))
}

// generate triggers narrative generation on the backend. The backend generates
// a single report by id (POST /api/reports/:id/generate); the frontend calls
// this with a sessionId, so we lazily generate each report for the session and
// return the refreshed list. The per-report-id generation is a no-op if the
// narrative is already present (backend handles idempotency).
const generate = async (sessionId: string): Promise<Report[]> => {
  const reports = await getBySession(sessionId)
  await Promise.all(
    reports.map((r) =>
      voidRequest('POST', API_ROUTES.REPORTS.GENERATE(r.id)).catch(() => undefined),
    ),
  )
  return getBySession(sessionId)
}

const approve = async (
  reportId: string,
  _data?: { narrative_final?: string; mission_ids?: string[] },
): Promise<Report> => {
  return itemRequest<Report>('POST', API_ROUTES.REPORTS.APPROVE(reportId), {
    approved_by: useAuthStore.getState().user?.id ?? '',
  } as ReportApproveRequest)
}

const send = async (reportId: string): Promise<Report> => {
  const res = await itemRequest<ReportTokenResponse>('POST', API_ROUTES.REPORTS.SEND(reportId))
  // The token response exposes the freshly minted parent token; map back to a Report.
  const existing = await getById(reportId).catch(() => null)
  return {
    ...(existing ?? ({} as Report)),
    id: res.id,
    parent_access_token: res.parent_access_token,
    status: res.status as Report['status'],
  }
}

// getPublicReport fetches a report via its parent access token (public endpoint).
const getPublicReport = async (token: string): Promise<PublicReportResponse | null> => {
  const res = await apiRequest<{ data: PublicReportResponse }>('GET', `${API_ROUTES.REPORTS.ACCESS}?token=${encodeURIComponent(token)}`)
  return res.data ?? null
}

// streamNarrative opens the SSE narrative stream for a report and invokes
// onChunk for each `data:` frame. Uses fetch + ReadableStream because
// apiRequest expects a single JSON response and cannot stream.
const streamNarrative = (
  reportId: string,
  onChunk: (chunk: unknown) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const url = `${getApiBaseUrl()}${API_ROUTES.REPORTS.NARRATIVE_STREAM(reportId)}`
  return fetch(url, { method: 'GET', credentials: 'include', signal })
    .then((response) => {
      if (!response.ok || !response.body) {
        throw new Error(`narrative stream failed: ${response.status}`)
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const read = (): Promise<void> =>
        reader.read().then(({ done, value }) => {
          if (done) return
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith('data:')) {
              const payload = trimmed.slice(5).trim()
              if (payload) {
                try {
                  onChunk(JSON.parse(payload))
                } catch {
                  // Ignore non-JSON keepalive/comment frames.
                }
              }
            }
          }
          return read()
        })
      return read()
    })
    .then(() => undefined)
}

export const reportService: ReportService = {
  getBySession,
  getById,
  generate,
  approve,
  send,
}

// Helpers used by the public parent flow (P1/P2, out of Fase 4 scope but kept
// here so the endpoint map matches the backend).
export const reportPublicService = {
  getByToken: getPublicReport,
  streamNarrative,
}
