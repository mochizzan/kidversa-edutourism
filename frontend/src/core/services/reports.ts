import type { Report } from '../types'
import type { ReportService, ReportTokenResponse } from './types'
import { apiRequest } from './backendClient'
import { itemsRequest, itemRequest, nullableItemRequest } from './apiEnvelope'
import { useAuthStore } from '../stores/authStore'
import { API_ROUTES } from '../constants/apiRoutes'

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

const generate = async (sessionId: string): Promise<Report[]> => {
  return itemsRequest<Report>('POST', API_ROUTES.REPORTS.GENERATE_SESSION, {
    session_id: sessionId,
  })
}

const approve = async (
  reportId: string,
  data?: { narrative_final?: string; mission_ids?: string[] },
  tenantId?: string | null,
): Promise<Report> => {
  return itemRequest<Report>('POST', API_ROUTES.REPORTS.APPROVE(reportId), {
    approved_by: useAuthStore.getState().user?.id ?? '',
    narrative_final: data?.narrative_final ?? '',
    mission_ids: data?.mission_ids ?? [],
  }, tenantId)
}

const send = async (reportId: string, tenantId?: string | null): Promise<ReportTokenResponse> => {
  // /send returns the freshly minted parent token (ReportTokenResponse), not a
  // full Report — type it precisely instead of faking a Report merge.
  return itemRequest<ReportTokenResponse>('POST', API_ROUTES.REPORTS.SEND(reportId), undefined, tenantId)
}

const generateNarrativeStream = async (
  reportId: string,
  force = false,
  tenantId?: string | null,
): Promise<void> => {
  // The POST only kicks off async generation (204 no-content); the actual
  // tokens arrive over the SSE stream, so nothing is returned here. Pass the
  // resource-owned tenant explicitly (apiRequest honors opts.tenantId).
  await apiRequest<unknown>(
    'POST',
    `${API_ROUTES.REPORTS.GENERATE_STREAM(reportId)}${force ? '?force=true' : ''}`,
    undefined,
    tenantId ? { tenantId } : undefined,
  )
}

// getPublicReport fetches a report via its parent access token (public endpoint).
const getPublicReport = async (token: string): Promise<PublicReportResponse | null> => {
  const res = await apiRequest<{ data: PublicReportResponse }>('GET', `${API_ROUTES.REPORTS.ACCESS}?token=${encodeURIComponent(token)}`)
  return res.data ?? null
}

export const reportService: ReportService = {
  getBySession,
  getById,
  generate,
  approve,
  send,
  generateNarrativeStream,
}

// Helpers used by the public parent flow (P1/P2, out of Fase 4 scope but kept
// here so the endpoint map matches the backend).
export const reportPublicService = {
  getByToken: getPublicReport,
}
