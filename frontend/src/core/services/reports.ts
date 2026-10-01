import type { PublicReport, Report } from '../types'
import type { ReportService, ReportSessionResult, ReportTokenResponse } from './types'
import { apiRequest } from './backend-client'
import { itemRequest, itemsWithExtrasRequest } from './api-envelope'
import { useAuthStore } from '../stores/authStore'
import { API_ROUTES } from '../constants/apiRoutes'

interface SuggestMissionsResponse {
  mission_ids: string[]
}

// Fetches the session's reports PLUS the sibling operation registries
// (active_generate / active_send) through itemsWithExtrasRequest — a plain
// itemsRequest/listRequest would drop them and lose per-row delivery state.
const getBySession = async (sessionId: string): Promise<ReportSessionResult> => {
  return itemsWithExtrasRequest<Report, ReportSessionResult['extras']>(
    'GET',
    API_ROUTES.REPORTS.BY_SESSION(sessionId),
  )
}

// Generate is async (202 Accepted): the server runs the session generate in a
// detached worker and the response only acknowledges acceptance. Progress and
// per-report outcomes are read from active_generate via getBySession.
const generate = async (sessionId: string): Promise<void> => {
  await apiRequest<unknown>('POST', API_ROUTES.REPORTS.GENERATE_SESSION, {
    session_id: sessionId,
  })
}

// Per-row "generate one" — same async 202 contract as generate (one
// participant scoped run for the session).
const generateOne = async (sessionId: string, participantId: string): Promise<void> => {
  await apiRequest<unknown>('POST', API_ROUTES.REPORTS.GENERATE_SESSION, {
    session_id: sessionId,
    participant_id: participantId,
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

const send = async (
  reportId: string,
  tenantId?: string | null,
  queue?: string[],
): Promise<ReportTokenResponse> => {
  // /send returns the freshly minted parent token (ReportTokenResponse), not a
  // full Report — type it precisely instead of faking a Report merge.
  // `queue` (optional) declares every report id this run still intends to send,
  // including the target below, so the server can track/409 in-flight targets.
  return itemRequest<ReportTokenResponse>(
    'POST',
    API_ROUTES.REPORTS.SEND(reportId),
    queue ? { queue } : undefined,
    tenantId,
  )
}

// saveMissions persists the selected mission IDs without changing report status.
// Used for auto-saving mission selections while the admin is still reviewing.
const saveMissions = async (
  reportId: string,
  missionIds: string[],
  tenantId?: string | null,
): Promise<Report> => {
  return itemRequest<Report>(
    'POST',
    API_ROUTES.REPORTS.SAVE_MISSIONS(reportId),
    { mission_ids: missionIds },
    tenantId,
  )
}

// ensureGalleryToken asks the backend for a QR-usable gallery token for the
// mini-raport QR footer, minting one server-side when missing/expired so the
// admin preview never renders the "[ QR CODE ]" placeholder for want of data.
const ensureGalleryToken = async (
  reportId: string,
  tenantId?: string | null,
): Promise<Report> => {
  return itemRequest<Report>(
    'POST',
    API_ROUTES.REPORTS.ENSURE_GALLERY_TOKEN(reportId),
    undefined,
    tenantId,
  )
}

// suggestMissions calls the AI recommendation endpoint for a report. Returns up
// to 4 mission IDs scoped to the report's Topic. No persistence — the caller
// pre-fills the manual selector and persists on Approve.
const suggestMissions = async (
  reportId: string,
  tenantId?: string | null,
): Promise<string[]> => {
  const res = await itemRequest<SuggestMissionsResponse>(
    'POST',
    API_ROUTES.REPORTS.SUGGEST_MISSIONS(reportId),
    undefined,
    tenantId,
  )
  return res?.mission_ids ?? []
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
const getPublicReport = async (token: string): Promise<PublicReport | null> => {
  const res = await itemRequest<PublicReport>('GET', `${API_ROUTES.REPORTS.ACCESS}?token=${encodeURIComponent(token)}`)
  return res ?? null
}

export const reportService: ReportService = {
  getBySession,
  generate,
  generateOne,
  approve,
  send,
  saveMissions,
  ensureGalleryToken,
  suggestMissions,
  generateNarrativeStream,
}

// Helpers used by the public parent flow (P1/P2, out of Fase 4 scope but kept
// here so the endpoint map matches the backend).
export const reportPublicService = {
  getByToken: getPublicReport,
}
