import type { ParticipantMission } from '../../types'
import { getById, put, queryByIndex, deleteByIndex } from '../storage/idb'
import { AppError } from '../../utils/errors'

const STORE_NAME = 'participant_missions'

export const mockParticipantMissionService = {
  getByReport: async (reportId: string): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 100))
    return await queryByIndex<ParticipantMission>(STORE_NAME, 'report_id', reportId)
  },
  
  getByParticipant: async (participantId: string): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 100))
    return await queryByIndex<ParticipantMission>(STORE_NAME, 'participant_id', participantId)
  },
  
  toggleComplete: async (missionId: string): Promise<ParticipantMission> => {
    await new Promise((r) => setTimeout(r, 200))
    const item = await getById<ParticipantMission>(STORE_NAME, missionId)
    if (!item) throw new AppError('NOT_FOUND', 'ParticipantMission not found')
    
    item.is_completed = !item.is_completed
    item.completed_at = item.is_completed ? new Date().toISOString() : undefined
    await put(STORE_NAME, item)
    return item
  },
  
  assignMissions: async (
    reportId: string,
    participantId: string,
    missionBankIds: string[]
  ): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 300))
    const newItems: ParticipantMission[] = missionBankIds.map((mbId) => ({
      id: `pm-${Date.now()}-${mbId}`,
      participant_id: participantId,
      report_id: reportId,
      mission_bank_id: mbId,
      is_completed: false,
    }))
    
    for (const item of newItems) {
      await put(STORE_NAME, item)
    }
    return newItems
  },

  replaceMissionsForReport: async (
    reportId: string,
    participantId: string,
    missionBankIds: string[]
  ): Promise<ParticipantMission[]> => {
    await new Promise((r) => setTimeout(r, 200))
    const existing = await queryByIndex<ParticipantMission>(STORE_NAME, 'report_id', reportId)
    for (const item of existing) {
      await deleteByIndex(STORE_NAME, 'id', item.id)
    }
    
    const newItems: ParticipantMission[] = missionBankIds.map((mbId) => ({
      id: `pm-${Date.now()}-${mbId}`,
      participant_id: participantId,
      report_id: reportId,
      mission_bank_id: mbId,
      is_completed: false,
    }))
    
    for (const item of newItems) {
      await put(STORE_NAME, item)
      await new Promise((r) => setTimeout(r, 5))
    }
    return newItems
  },
}
