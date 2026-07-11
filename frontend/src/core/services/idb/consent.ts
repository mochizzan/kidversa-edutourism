import type { ConsentLog, Participant } from '../../types'
import type { ConsentService } from '../types'
import { ConsentType } from '../../types'
import { getAll, getById, put, queryByIndex } from '../storage/idb'
import { AppError } from '../../utils/errors'

const STORE_NAME = 'consent_logs'

const sendRequest = async (sessionId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 300))
  const participants = await queryByIndex<Participant>('participants', 'session_id', sessionId)
  const allLogs = await getAll<ConsentLog>(STORE_NAME)
  
  for (const p of participants) {
    if (!allLogs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.RECORDING)) {
      await put(STORE_NAME, {
        id: `cl-${Date.now()}-${p.id}-recording`,
        participant_id: p.id,
        consent_type: ConsentType.RECORDING,
        value: false,
        sent_at: new Date().toISOString(),
      })
    }
    if (!allLogs.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.PHOTO)) {
      await put(STORE_NAME, {
        id: `cl-${Date.now()}-${p.id}-photo`,
        participant_id: p.id,
        consent_type: ConsentType.PHOTO,
        value: false,
        sent_at: new Date().toISOString(),
      })
    }
  }
}

const getBySession = async (sessionId: string): Promise<ConsentLog[]> => {
  await new Promise((r) => setTimeout(r, 100))
  const participants = await queryByIndex<Participant>('participants', 'session_id', sessionId)
  const participantIds = new Set(participants.map((p) => p.id))
  const allLogs = await getAll<ConsentLog>(STORE_NAME)
  return allLogs.filter((l) => participantIds.has(l.participant_id))
}

const submit = async (
  token: string,
  recording: boolean,
  photo: boolean
): Promise<void> => {
  await new Promise((r) => setTimeout(r, 300))
  
  // Find the participant by token (simplified: token = participant_id)
  const participant = await getById<Participant>('participants', token)
  if (!participant) throw new AppError('NOT_FOUND', 'Invalid token')
  
  // Update consent logs
  const allLogs = await getAll<ConsentLog>(STORE_NAME)
  const recLog = allLogs.find(
    (l) => l.participant_id === participant.id && l.consent_type === ConsentType.RECORDING
  )
  if (recLog) {
    recLog.value = recording
    recLog.responded_at = new Date().toISOString()
    await put(STORE_NAME, recLog)
  }
  
  const photoLog = allLogs.find(
    (l) => l.participant_id === participant.id && l.consent_type === ConsentType.PHOTO
  )
  if (photoLog) {
    photoLog.value = photo
    photoLog.responded_at = new Date().toISOString()
    await put(STORE_NAME, photoLog)
  }
  
  // Update participant consent
  participant.consent_recording = recording
  participant.consent_photo = photo
  participant.consent_at = new Date().toISOString()
  await put('participants', participant)
}

export const idbConsentService: ConsentService = {
  sendRequest,
  getBySession,
  submit,
}
