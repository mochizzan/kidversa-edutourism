import type { ConsentLog, ConsentFlatItem } from '../types'
import type {
  ConsentService,
  ConsentSendWhatsAppResponse,
  ConsentInfo,
} from './types'

export type { ConsentInfo }
import { apiRequest } from './backend-client'
import { itemRequest, itemsRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

interface ConsentSummarySession {
  session_id: string
  items: ConsentLog[]
}

const getBySession = async (sessionId: string): Promise<ConsentLog[]> => {
  return itemsRequest<ConsentLog>('GET', API_ROUTES.CONSENT.BY_SESSION(sessionId))
}

const getSummary = async (sessionIds: string[]): Promise<Record<string, ConsentLog[]>> => {
  const qs = sessionIds.map((id) => encodeURIComponent(id)).join(',')
  const res = await itemRequest<{ sessions: ConsentSummarySession[] }>(
    'GET',
    `${API_ROUTES.CONSENT.SUMMARY}?session_ids=${qs}`,
  )
  const map: Record<string, ConsentLog[]> = {}
  for (const s of res.sessions ?? []) {
    map[s.session_id] = s.items
  }
  return map
}

const sendViaWhatsApp = async (
  sessionId: string,
  force?: boolean,
): Promise<ConsentSendWhatsAppResponse> => {
  return itemRequest<ConsentSendWhatsAppResponse>(
    'POST',
    API_ROUTES.CONSENT.SEND_WHATSAPP + (force ? '?force=true' : ''),
    { session_id: sessionId },
  )
}

const submitCombined = async (
  token: string,
  photo: boolean,
  responderName?: string,
): Promise<void> => {
  await apiRequest<unknown>('POST', API_ROUTES.CONSENT.RESPOND_COMBINED, {
    token,
    photo,
    responder_name: responderName,
  })
}

const getFlat = async (): Promise<ConsentFlatItem[]> => {
  return itemsRequest<ConsentFlatItem>('GET', API_ROUTES.CONSENT.FLAT)
}

const sendSingle = async (participantId: string, force = false): Promise<void> => {
  await itemRequest<{ status: string }>(
    'POST',
    API_ROUTES.CONSENT.SEND_SINGLE + (force ? '?force=true' : ''),
    { participant_id: participantId },
  )
}

const getInfo = async (token: string): Promise<ConsentInfo> => {
  return itemRequest<ConsentInfo>('GET', API_ROUTES.CONSENT.INFO(token))
}

export const consentService: ConsentService = {
  sendViaWhatsApp,
  submitCombined,
  getBySession,
  getSummary,
  getInfo,
  getFlat,
  sendSingle,
}
