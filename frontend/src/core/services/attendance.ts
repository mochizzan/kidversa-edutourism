import type { ParticipantAttendance, AttendanceUpsertDTO } from '../types'
import { listRequest, itemRequest, arrayRequest } from './api-envelope'
import { API_ROUTES } from '../constants/apiRoutes'

const getBySession = async (sessionId: string): Promise<ParticipantAttendance[]> => {
    const res = await listRequest<ParticipantAttendance>(API_ROUTES.ATTENDANCE.BY_SESSION(sessionId), { limit: 100 })
    return res.data
}

const upsert = async (data: AttendanceUpsertDTO): Promise<ParticipantAttendance> => {
    return itemRequest<ParticipantAttendance>('POST', API_ROUTES.ATTENDANCE.UPSERT, data)
}

const bulkUpsert = async (items: AttendanceUpsertDTO[]): Promise<ParticipantAttendance[]> => {
    return arrayRequest<ParticipantAttendance>('POST', API_ROUTES.ATTENDANCE.BULK_UPSERT, { items })
}

export const attendanceService = {
    getBySession,
    upsert,
    bulkUpsert,
}
