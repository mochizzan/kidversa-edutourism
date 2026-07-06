import type { ConsentLog } from '../../types'
import type { ConsentService } from '../types'
import { ConsentType } from '../../types'
import { mockStorage } from './db'
import { seedParticipants } from './data/seed'

const STORAGE_KEY = 'consent_logs_v1'

const init = (): ConsentLog[] => {
  const existing = mockStorage.get<ConsentLog[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: ConsentLog[] = seedParticipants
    .filter((p) => p.consent_at)
    .flatMap((p) => [
      {
        id: `cl-${p.id}-recording`,
        participant_id: p.id,
        consent_type: ConsentType.RECORDING,
        value: p.consent_recording,
        sent_at: new Date(new Date(p.consent_at!).getTime() - 86400000 * 2).toISOString(),
        responded_at: p.consent_at,
      },
      {
        id: `cl-${p.id}-photo`,
        participant_id: p.id,
        consent_type: ConsentType.PHOTO,
        value: p.consent_photo,
        sent_at: new Date(new Date(p.consent_at!).getTime() - 86400000 * 2).toISOString(),
        responded_at: p.consent_at,
      },
    ])
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = (): ConsentLog[] => mockStorage.get<ConsentLog[]>(STORAGE_KEY, init())

const sendRequest = async (sessionId: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 300))
  const participants = seedParticipants.filter((p) => p.session_id === sessionId)
  const all = getAll()
  for (const p of participants) {
    if (!all.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.RECORDING)) {
      all.push({
        id: `cl-${Date.now()}-${p.id}-recording`,
        participant_id: p.id,
        consent_type: ConsentType.RECORDING,
        value: false,
        sent_at: new Date().toISOString(),
      })
    }
    if (!all.some((l) => l.participant_id === p.id && l.consent_type === ConsentType.PHOTO)) {
      all.push({
        id: `cl-${Date.now()}-${p.id}-photo`,
        participant_id: p.id,
        consent_type: ConsentType.PHOTO,
        value: false,
        sent_at: new Date().toISOString(),
      })
    }
  }
  mockStorage.set(STORAGE_KEY, all)
}

const getBySession = async (sessionId: string): Promise<ConsentLog[]> => {
  await new Promise((r) => setTimeout(r, 100))
  const participants = seedParticipants.filter((p) => p.session_id === sessionId)
  const participantIds = new Set(participants.map((p) => p.id))
  return getAll().filter((l) => participantIds.has(l.participant_id))
}

const submit = async (
  token: string,
  recording: boolean,
  photo: boolean
): Promise<void> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = getAll()
  // Find the participant by token (simplified: token = participant_id)
  const participant = seedParticipants.find((p) => p.id === token)
  if (!participant) throw new Error('INVALID_TOKEN')
  // Update consent logs
  const recLog = all.find(
    (l) => l.participant_id === participant.id && l.consent_type === ConsentType.RECORDING
  )
  if (recLog) {
    recLog.value = recording
    recLog.responded_at = new Date().toISOString()
  }
  const photoLog = all.find(
    (l) => l.participant_id === participant.id && l.consent_type === ConsentType.PHOTO
  )
  if (photoLog) {
    photoLog.value = photo
    photoLog.responded_at = new Date().toISOString()
  }
  // Update participant consent
  participant.consent_recording = recording
  participant.consent_photo = photo
  participant.consent_at = new Date().toISOString()
  mockStorage.set(STORAGE_KEY, all)
}

export const mockConsentService: ConsentService = {
  sendRequest,
  getBySession,
  submit,
}
