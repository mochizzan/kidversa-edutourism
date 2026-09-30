import type { ConsentFlatItem } from '../types'
import type {
  ConsentService,
  ConsentSendWhatsAppResponse,
  ConsentInfo,
  ConsentFlatExtras,
  ConsentFlatResult,
} from './types'

export type { ConsentInfo }
import { apiRequest } from './backend-client'
import { itemRequest, itemsWithExtrasRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

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

const getFlat = async (): Promise<ConsentFlatResult> => {
  // itemsWithExtrasRequest keeps sibling envelope fields (active_batches) that
  // a plain itemsRequest would drop — server delivery state travels with items.
  const { items, extras } = await itemsWithExtrasRequest<
    ConsentFlatItem,
    ConsentFlatExtras
  >('GET', API_ROUTES.CONSENT.FLAT)
  return { items, extras }
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
  getInfo,
  getFlat,
  sendSingle,
}
