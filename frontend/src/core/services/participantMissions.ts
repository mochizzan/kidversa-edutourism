import type { ParticipantMission } from '../types'
import { apiRequest } from './backendClient'

interface ParticipantMissionListEnvelope {
  items: ParticipantMission[]
}

interface ParticipantMissionRequest {
  participant_id: string
  report_id: string
  mission_bank_id: string
  is_completed: boolean
}

interface ParticipantMissionBulkRequest {
  report_id: string
  items: ParticipantMissionRequest[]
}

export interface ParticipantMissionsService {
  getByReport(reportId: string): Promise<ParticipantMission[]>
  getByParticipant(participantId: string): Promise<ParticipantMission[]>
  toggleComplete(missionId: string): Promise<ParticipantMission>
  assignMissions(
    reportId: string,
    participantId: string,
    missionBankIds: string[],
  ): Promise<ParticipantMission[]>
  replaceMissionsForReport(
    reportId: string,
    participantId: string,
    missionBankIds: string[],
  ): Promise<ParticipantMission[]>
  create(req: { participant_id: string; report_id: string; mission_bank_id: string; is_completed: boolean }): Promise<ParticipantMission>
  delete(missionId: string): Promise<void>
}

const getByReport = async (reportId: string): Promise<ParticipantMission[]> => {
  const res = await apiRequest<ParticipantMissionListEnvelope>(
    'GET',
    `/api/participant-missions?report_id=${encodeURIComponent(reportId)}`,
  )
  return res.items ?? []
}

const getByParticipant = async (participantId: string): Promise<ParticipantMission[]> => {
  const res = await apiRequest<ParticipantMissionListEnvelope>(
    'GET',
    `/api/participant-missions?participant_id=${encodeURIComponent(participantId)}`,
  )
  return res.items ?? []
}

const toggleComplete = async (missionId: string): Promise<ParticipantMission> => {
  return apiRequest<ParticipantMission>(
    'POST',
    `/api/participant-missions/${encodeURIComponent(missionId)}/toggle`,
  )
}

const create = async (req: {
  participant_id: string
  report_id: string
  mission_bank_id: string
  is_completed: boolean
}): Promise<ParticipantMission> => {
  return apiRequest<ParticipantMission>('POST', '/api/participant-missions', {
    participant_id: req.participant_id,
    report_id: req.report_id,
    mission_bank_id: req.mission_bank_id,
    is_completed: req.is_completed,
  })
}

const deleteMission = async (missionId: string): Promise<void> => {
  await apiRequest<unknown>('DELETE', `/api/participant-missions/${encodeURIComponent(missionId)}`)
}

const assignMissions = async (
  reportId: string,
  participantId: string,
  missionBankIds: string[],
): Promise<ParticipantMission[]> => {
  const created = await Promise.all(
    missionBankIds.map((mbId) =>
      create({ participant_id: participantId, report_id: reportId, mission_bank_id: mbId, is_completed: false }),
    ),
  )
  return created
}

const replaceMissionsForReport = async (
  reportId: string,
  participantId: string,
  missionBankIds: string[],
): Promise<ParticipantMission[]> => {
  const items: ParticipantMissionRequest[] = missionBankIds.map((mbId) => ({
    participant_id: participantId,
    report_id: reportId,
    mission_bank_id: mbId,
    is_completed: false,
  }))
  const res = await apiRequest<ParticipantMissionListEnvelope>('POST', '/api/participant-missions/replace', {
    report_id: reportId,
    items,
  } as ParticipantMissionBulkRequest)
  return res.items ?? []
}

export const participantMissionsService: ParticipantMissionsService = {
  getByReport,
  getByParticipant,
  toggleComplete,
  assignMissions,
  replaceMissionsForReport,
  create,
  delete: deleteMission,
}

// Kept alias for the existing consumer (MissionsPage) which imports the
// singular `participantMissionService` name from the missions barrel.
export const participantMissionService = participantMissionsService
