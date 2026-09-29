import type { ParticipantAttendance, AttendanceUpsertDTO } from '../types'
import { listRequest, itemRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

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
