import type { ParticipantMission } from '../types'
import { itemsRequest, itemRequest } from './apiEnvelope'
import { API_ROUTES } from '../constants/apiRoutes'

export interface ParticipantMissionsService {
  getByReport(reportId: string): Promise<ParticipantMission[]>
  toggleComplete(missionId: string): Promise<ParticipantMission>
}

const getByReport = async (reportId: string): Promise<ParticipantMission[]> => {
  return itemsRequest<ParticipantMission>(
    'GET',
    API_ROUTES.PARTICIPANT_MISSIONS.BY_REPORT(reportId),
  )
}

const toggleComplete = async (missionId: string): Promise<ParticipantMission> => {
  return itemRequest<ParticipantMission>(
    'POST',
    API_ROUTES.PARTICIPANT_MISSIONS.TOGGLE(missionId),
  )
}

export const participantMissionsService: ParticipantMissionsService = {
  getByReport,
  toggleComplete,
}

// Singular alias kept for the existing consumers (MissionsPage, ReportPage)
// which import `participantMissionService`. This is the single source of truth —
// missions.ts re-exports it rather than redefining it.
export const participantMissionService = participantMissionsService
