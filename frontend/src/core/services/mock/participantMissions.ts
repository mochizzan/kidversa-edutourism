import type { ParticipantMission } from '../../types'
import { mockStorage } from './db'

const STORAGE_KEY = 'participant_missions_v1'

const init = (): ParticipantMission[] => {
  const existing = mockStorage.get<ParticipantMission[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: ParticipantMission[] = [
    {
      id: 'pm-1',
      participant_id: 'part-4',
      report_id: 'rpt-1',
      mission_bank_id: 'm-1',
      is_completed: false,
    },
    {
      id: 'pm-2',
      participant_id: 'part-4',
      report_id: 'rpt-1',
      mission_bank_id: 'm-4',
      is_completed: true,
      completed_at: '2026-06-25T10:00:00.000Z',
    },
    {
      id: 'pm-3',
      participant_id: 'part-4',
      report_id: 'rpt-1',
      mission_bank_id: 'm-7',
      is_completed: false,
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

export const mockParticipantMissionService = {
  getByReport: async (reportId: string): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 100))
    return init().filter((pm) => pm.report_id === reportId)
  },
  getByParticipant: async (participantId: string): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 100))
    return init().filter((pm) => pm.participant_id === participantId)
  },
  toggleComplete: async (missionId: string): Promise<ParticipantMission> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = init()
    const item = all.find((pm) => pm.id === missionId)
    if (!item) throw new Error('ParticipantMission not found')
    item.is_completed = !item.is_completed
    item.completed_at = item.is_completed ? new Date().toISOString() : undefined
    mockStorage.set(STORAGE_KEY, all)
    return item
  },
  assignMissions: async (
    reportId: string,
    participantId: string,
    missionBankIds: string[]
  ): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 300))
    const all = init()
    const newItems: ParticipantMission[] = missionBankIds.map((mbId) => ({
      id: `pm-${Date.now()}-${mbId}`,
      participant_id: participantId,
      report_id: reportId,
      mission_bank_id: mbId,
      is_completed: false,
    }))
    all.push(...newItems)
    mockStorage.set(STORAGE_KEY, all)
    return newItems
  },
}
