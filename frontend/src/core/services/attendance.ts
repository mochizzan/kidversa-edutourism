import type { ParticipantAttendance, AttendanceUpsertDTO } from '../types'
import { listRequest, itemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

// Perbaikan-1 attendance decision: OPSI B (retain session-scoped).
// The backend keeps the (participant_id, session_id) unique key — NO
// session_stage_id column, NO migration — so one toggle row covers the whole
// session and identical values across topics are CORRECT by design (not the
// topik-1/topik-2 bug). The toggle renders ONCE per session on GroupPage with
// an explicit whole-session label; this page never keys attendance by stage.
// Presence still gates grading per active topic (hadir prasyarat nilai) via
// evaluateGroupCompletion. Consequence: "hadir topik-2 berbeda" is NOT a
// supported state — a per-topic presence split would require OPSI A
// (schema + repo + DTO + service key migration).

const getBySession = async (sessionId: string): Promise<ParticipantAttendance[]> => {
    const res = await listRequest<ParticipantAttendance>(API_ROUTES.ATTENDANCE.BASE, { limit: 100, filters: { session_id: sessionId } })
    return res.data
}

const upsert = async (data: AttendanceUpsertDTO): Promise<ParticipantAttendance> => {
    return itemRequest<ParticipantAttendance>('POST', API_ROUTES.ATTENDANCE.UPSERT, data)
}

export const attendanceService = {
    getBySession,
    upsert,
}
