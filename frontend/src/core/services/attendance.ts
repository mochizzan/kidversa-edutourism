import type { ParticipantAttendance, AttendanceUpsertDTO } from '../types'
import { listRequest, itemRequest } from './api-envelope'
import { API_ROUTES, ATTENDANCE_TOPIC_FIELD } from '../constants/apiRoutes'

// Per-topic attendance (kontrak: session_stage_id kanonis, disepakati dengan
// agen backend SensitiveGoldfish). Backend mengunci kehadiran per
// (participant_id, session_id, session_stage_id); upsert topik B tidak
// menyentuh topik A. session_id tetap dikirim (kompatibilitas + tenant scope).

const getBySession = async (sessionId: string): Promise<ParticipantAttendance[]> => {
    const res = await listRequest<ParticipantAttendance>(API_ROUTES.ATTENDANCE.BASE, { limit: 100, filters: { session_id: sessionId } })
    return res.data
}

const getByTopic = async (sessionId: string, sessionStageId: string): Promise<ParticipantAttendance[]> => {
    const res = await listRequest<ParticipantAttendance>(API_ROUTES.ATTENDANCE.BASE, {
        limit: 100,
        filters: { session_id: sessionId, [ATTENDANCE_TOPIC_FIELD]: sessionStageId },
    })
    return res.data
}

const upsert = async (data: AttendanceUpsertDTO): Promise<ParticipantAttendance> => {
    return itemRequest<ParticipantAttendance>('POST', API_ROUTES.ATTENDANCE.UPSERT, data)
}

export const attendanceService = {
    getBySession,
    getByTopic,
    upsert,
}
