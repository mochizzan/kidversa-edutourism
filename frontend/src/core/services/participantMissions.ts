import type { ParticipantMission } from '../types'
import { itemsRequest, itemRequest, voidRequest } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface ParticipantMissionsService {
  getByReport(reportId: string): Promise<ParticipantMission[]>
  getByParticipant(participantId: string): Promise<ParticipantMission[]>
  toggleComplete(missionId: string): Promise<ParticipantMission>
  create(req: { report_id: string; mission_bank_id: string; is_completed: boolean }): Promise<ParticipantMission>
  delete(missionId: string): Promise<void>
}

const getByReport = async (reportId: string): Promise<ParticipantMission[]> => {
  return itemsRequest<ParticipantMission>(
    'GET',
    API_ROUTES.PARTICIPANT_MISSIONS.BY_REPORT(reportId),
  )
}

const getByParticipant = async (participantId: string): Promise<ParticipantMission[]> => {
  return itemsRequest<ParticipantMission>(
    'GET',
    API_ROUTES.PARTICIPANT_MISSIONS.BY_PARTICIPANT(participantId),
  )
}

const toggleComplete = async (missionId: string): Promise<ParticipantMission> => {
  return itemRequest<ParticipantMission>(
    'POST',
    API_ROUTES.PARTICIPANT_MISSIONS.TOGGLE(missionId),
  )
}

const create = async (req: {
  report_id: string
  mission_bank_id: string
  is_completed: boolean
}): Promise<ParticipantMission> => {
  return itemRequest<ParticipantMission>('POST', API_ROUTES.PARTICIPANT_MISSIONS.BASE, {
    report_id: req.report_id,
    mission_bank_id: req.mission_bank_id,
    is_completed: req.is_completed,
  })
}

const deleteMission = async (missionId: string): Promise<void> => {
  await voidRequest('DELETE', API_ROUTES.PARTICIPANT_MISSIONS.DETAIL(missionId))
}

export const participantMissionsService: ParticipantMissionsService = {
  getByReport,
  getByParticipant,
  toggleComplete,
  create,
  delete: deleteMission,
}

// Kept alias for the existing consumer (MissionsPage) which imports the
// singular `participantMissionService` name from the missions barrel.
export const participantMissionService = participantMissionsService
