import type { Report } from '../types'
import type { ReportService } from './types'
import { apiRequest } from './backendClient'
import { itemsRequest, itemRequest, nullableItemRequest } from './apiEnvelope'
import { useAuthStore } from '../stores/authStore'
import { API_ROUTES } from '../constants/apiRoutes'

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

const generate = async (sessionId: string): Promise<Report[]> => {
  return itemsRequest<Report>('POST', API_ROUTES.REPORTS.GENERATE_SESSION, {
    session_id: sessionId,
  })
}

const approve = async (
  reportId: string,
  data?: { narrative_final?: string; mission_ids?: string[] },
): Promise<Report> => {
  return itemRequest<Report>('POST', API_ROUTES.REPORTS.APPROVE(reportId), {
    approved_by: useAuthStore.getState().user?.id ?? '',
    narrative_final: data?.narrative_final ?? '',
    mission_ids: data?.mission_ids ?? [],
  })
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
}
