import type { ConsentLog } from '../types'
import type { ConsentService } from './types'
import { apiRequest } from './backendClient'
import { itemsRequest } from './apiEnvelope'
import { sessionService } from './sessions'
import { ConsentType } from '../types'

interface ConsentRequestResponse {
  token: string
}

// sendRequest issues single-use consent tokens (one per participant, per type)
// for every participant in the session. The backend hard-fails when
// `participant_id` is empty, so we resolve the session's participants first and
// emit one token request per (participant, type). The backend only emits a token
// when one does not already exist for the (participant, session, type) triple,
// so calling this repeatedly is idempotent.
const sendRequest = async (sessionId: string): Promise<void> => {
  const types: ConsentType[] = [ConsentType.RECORDING, ConsentType.PHOTO]
  const participants = await sessionService.getParticipants(sessionId)
  await Promise.all(
    participants.flatMap((participant) =>
      types.map((consentType) =>
        apiRequest<ConsentRequestResponse>('POST', '/api/consent/request', {
          participant_id: participant.id,
          session_id: sessionId,
          consent_type: consentType,
        }),
      ),
    ),
  )
}

const getBySession = async (sessionId: string): Promise<ConsentLog[]> => {
  return itemsRequest<ConsentLog>('GET', `/api/consent?session_id=${encodeURIComponent(sessionId)}`)
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
