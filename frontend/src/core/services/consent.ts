import type { ConsentLog } from '../types'
import type { ConsentService } from './types'
import { apiRequest } from './backendClient'
import { ConsentType } from '../types'

interface ConsentListEnvelope {
  items: ConsentLog[]
}

interface ConsentRequestResponse {
  token: string
}

// sendRequest issues single-use consent tokens (one per type) for every
// participant in the session. The backend only emits a token when one does
// not already exist for the (participant, session, type) triple, so calling
// this repeatedly is idempotent.
const sendRequest = async (sessionId: string): Promise<void> => {
  const types: ConsentType[] = [ConsentType.RECORDING, ConsentType.PHOTO]
  await Promise.all(
    types.map((consentType) =>
      apiRequest<ConsentRequestResponse>('POST', '/api/consent/request', {
        session_id: sessionId,
        consent_type: consentType,
      }),
    ),
  )
}

const getBySession = async (sessionId: string): Promise<ConsentLog[]> => {
  const res = await apiRequest<ConsentListEnvelope>('GET', `/api/consent?session_id=${encodeURIComponent(sessionId)}`)
  return res.items ?? []
}

// submit records a parent's consent decision via the single-use public token.
// The backend's respond-public endpoint accepts a single boolean `value` and
// consumes the token, so we forward the recording decision. (The parent-token
// plumbing that distinguishes recording vs photo is finalized in Fase 6 / P2.)
const submit = async (
  token: string,
  recording: boolean,
  _photo: boolean,
): Promise<void> => {
  await apiRequest<unknown>('POST', `/api/consent/respond-public?token=${encodeURIComponent(token)}`, {
    value: recording,
  })
}

export const consentService: ConsentService = {
  sendRequest,
  getBySession,
  submit,
}
