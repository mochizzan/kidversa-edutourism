import type { ConsentLog } from '../types'
import type {
  ConsentService,
  ConsentSendWhatsAppResponse,
} from './types'
import { apiRequest } from './backendClient'
import { itemRequest, itemsRequest } from './apiEnvelope'
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
  recording: boolean,
  photo: boolean,
): Promise<void> => {
  await apiRequest<unknown>('POST', API_ROUTES.CONSENT.RESPOND_COMBINED, {
    token,
    recording,
    photo,
  })
}

export const consentService: ConsentService = {
  sendViaWhatsApp,
  submitCombined,
  getBySession,
  getSummary,
}
