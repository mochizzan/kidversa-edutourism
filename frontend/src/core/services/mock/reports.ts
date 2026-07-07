import type { Report, Participant, Assessment, MissionBank, SessionStage, ProgramStage } from '../../types'
import type { ReportService } from '../types'
import { ReportStatus } from '../../types'
import { getById, put, queryByIndex, getAll, deleteById } from '../storage/idb'
import { AppError } from '../../utils/errors'
import { selectMissionsForParticipant } from '../../utils/missionSelector'
import { generateReportNarrative } from '../../utils/reportNarrative'

const STORE_NAME = 'reports'

const getBySession = async (sessionId: string): Promise<Report[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return await queryByIndex<Report>(STORE_NAME, 'session_id', sessionId)
}

const getById_ = async (id: string): Promise<Report | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return await getById<Report>(STORE_NAME, id)
}

const generate = async (sessionId: string): Promise<Report[]> => {
  await new Promise((r) => setTimeout(r, 1000))

  const participants = await queryByIndex<Participant>('participants', 'session_id', sessionId)
  const existingReports = await queryByIndex<Report>(STORE_NAME, 'session_id', sessionId)
  const existingByParticipant = new Map(existingReports.map((r) => [r.participant_id, r]))

  const allMissions = await getAll<MissionBank>('mission_banks')
  const availableMissions = allMissions.filter((m) => m.is_active)

  const sessionStages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
  const programStages = await getAll<ProgramStage>('program_stages')
  const stageNames = new Map<string, string>()
  sessionStages.forEach((ss) => {
    const ps = programStages.find((p) => p.id === ss.program_stage_id)
    if (ps) stageNames.set(ss.id, ps.name)
  })

  const participantsNeedingReport: { p: Participant; assessments: Assessment[] }[] = []

  for (const p of participants) {
    if (existingByParticipant.has(p.id)) continue

    const assessments = await queryByIndex<Assessment>('assessments', 'participant_id', p.id)
    participantsNeedingReport.push({ p, assessments })
  }

  if (participantsNeedingReport.length > 0) {
    const missing = participantsNeedingReport
      .filter(({ assessments }) => assessments.length === 0)
      .map(({ p }) => p.child_name)

    if (missing.length > 0) {
      throw new AppError(
        'CONFLICT',
        `Peserta berikut belum memiliki penilaian: ${missing.join(', ')}. Lengkapi penilaian terlebih dahulu.`
      )
    }
  }

  for (const { p, assessments } of participantsNeedingReport) {
    const selectedMissionIds = selectMissionsForParticipant({
      participantId: p.id,
      assessments,
      availableMissions,
      sessionStages,
    })

    const narrative = generateReportNarrative({
      childName: p.child_name,
      assessments,
      stageNames,
    })

    const reportId = `rpt-${Date.now()}-${p.id}`
    const report: Report = {
      id: reportId,
      participant_id: p.id,
      session_id: sessionId,
      ai_narrative_draft: narrative,
      ai_narrative_final: undefined,
      mission_ids_json: selectedMissionIds,
      report_pdf_url: undefined,
      parent_access_token: `parent-token-${p.id}-${Date.now()}`,
      status: ReportStatus.PENDING_REVIEW,
    }
    await put(STORE_NAME, report)

    for (const missionId of selectedMissionIds) {
      const pm = {
        id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        participant_id: p.id,
        report_id: reportId,
        mission_bank_id: missionId,
        is_completed: false,
        completed_at: undefined,
      }
      await put('participant_missions', pm)
    }

    await new Promise((r) => setTimeout(r, 10))
  }

  return getBySession(sessionId)
}

const approve = async (
  reportId: string,
  data?: { narrative_final?: string; mission_ids?: string[] }
): Promise<Report> => {
  await new Promise((r) => setTimeout(r, 300))
  const report = await getById<Report>(STORE_NAME, reportId)
  if (!report) throw new AppError('NOT_FOUND', 'Report not found')

  report.status = ReportStatus.APPROVED
  report.ai_narrative_final = data?.narrative_final ?? report.ai_narrative_draft
  
  if (data?.mission_ids) {
    report.mission_ids_json = data.mission_ids
  }
  
  await put(STORE_NAME, report)

  if (data?.mission_ids) {
    const existingMissions = await queryByIndex<{ id: string; report_id: string }>(
      'participant_missions',
      'report_id',
      reportId
    )
    for (const pm of existingMissions) {
      await deleteById('participant_missions', pm.id)
    }

    for (const missionId of data.mission_ids) {
      const pm = {
        id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        participant_id: report.participant_id,
        report_id: reportId,
        mission_bank_id: missionId,
        is_completed: false,
        completed_at: undefined,
      }
      await put('participant_missions', pm)
      await new Promise((r) => setTimeout(r, 5))
    }
  }

  return report
}

const send = async (reportId: string): Promise<Report> => {
  await new Promise((r) => setTimeout(r, 300))
  const report = await getById<Report>(STORE_NAME, reportId)
  if (!report) throw new AppError('NOT_FOUND', 'Report not found')
  
  report.status = ReportStatus.SENT
  report.sent_at = new Date().toISOString()
  await put(STORE_NAME, report)
  return report
}

export const mockReportService: ReportService = {
  getBySession,
  getById: getById_,
  generate,
  approve,
  send,
}
