// App Constants
import { i18n } from '../i18n'

export const APP_NAME = 'Kidversa'

// Placeholder src for <img> elements whose remote media fails to load —
// shows a localized "Gagal Muat" instead of the browser's broken-image glyph.
export function imageFallbackSrc(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="#e0e0e0" width="200" height="200"/><text x="50%" y="50%" fill="#999" text-anchor="middle" dy=".3em" font-size="14" font-family="sans-serif">${i18n.t('common.image.fallback')}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Routes
export const ROUTES = {
  HOME: '/',
  AUTH: {
    BASE: '/auth',
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    CHANGE_PASSWORD: '/auth/change-password',
  },
  ADMIN: {
    BASE: '/admin',
    DASHBOARD: '/admin/dashboard',
    PROGRAMS: '/admin/programs',
    PROGRAM_NEW: '/admin/programs/new',
    SESSIONS: '/admin/sessions',
    SESSION_NEW: '/admin/sessions/new',
    PARTICIPANTS: '/admin/participants',
    PARTICIPANT_NEW: '/admin/participants/new',
    REPORTS: '/admin/reports',
    MISSIONS: '/admin/missions',
    MISSION_NEW: '/admin/missions/new',
    TOPICS: '/admin/topics',
    TOPIC_NEW: '/admin/topics/new',
    ACTIVITIES: '/admin/activities',
    ACTIVITY_NEW: '/admin/activities/new',
    FRAMES: '/admin/frames',
    FRAME_UPLOAD: '/admin/frames/upload',
    USERS: '/admin/users',
    USER_NEW: '/admin/users/new',
    TENANTS: '/admin/tenants',
    CONSENT: '/admin/consent',
  },
  FASILITATOR: {
    BASE: '/fasilitator',
    DASHBOARD: '/fasilitator/dashboard',
    GROUPS: '/fasilitator/groups',
    CAMERA: '/fasilitator/camera',
    PROFILE: '/fasilitator/profile',
    // Galeri navigation flow (camera ≠ galeri).
    GALERI: '/fasilitator/galeri',
    GALERI_SESSION: (sessionId: string) => `/fasilitator/galeri/sesi/${sessionId}`,
    GALERI_GROUP: (groupId: string) => `/fasilitator/galeri/kelompok/${groupId}`,
    GALERI_CHILD: (childId: string) => `/fasilitator/galeri/peserta/${childId}`,
  },
  PARENT: {
    REPORT: '/parent/report',
  },
} as const

// Parameterized path builders (backward-compatible)

// Small helper to append optional search params to a base path.
const withSearch = (base: string, params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][]
  if (!entries.length) return base
  const q = new URLSearchParams()
  entries.forEach(([k, v]) => q.set(k, String(v)))
  return `${base}?${q.toString()}`
}

export const programListPath = () => ROUTES.ADMIN.PROGRAMS
export const programDetailPath = (id: string) => `${ROUTES.ADMIN.PROGRAMS}/${id}`
export const programEditPath = (id: string) => `${ROUTES.ADMIN.PROGRAMS}/${id}/edit`
export const programStagePath = (programId: string, stageId: string) =>
  `${ROUTES.ADMIN.PROGRAMS}/${programId}/stages/${stageId}`

export const topicListPath = (params?: { programId?: string }) =>
  withSearch(ROUTES.ADMIN.TOPICS, { programId: params?.programId })

export const topicNewPath = (params?: { programId?: string }) =>
  withSearch(ROUTES.ADMIN.TOPIC_NEW, { programId: params?.programId })

export const topicDetailPath = (id: string) => `${ROUTES.ADMIN.TOPICS}/${id}`

export const topicEditPath = (id: string) => `${ROUTES.ADMIN.TOPICS}/${id}/edit`

export const activityListPath = (params?: { programId?: string; stageId?: string }) =>
  withSearch(ROUTES.ADMIN.ACTIVITIES, { programId: params?.programId, stageId: params?.stageId })

export const activityNewPath = (params?: { programId?: string; stageId?: string }) =>
  withSearch(ROUTES.ADMIN.ACTIVITY_NEW, { programId: params?.programId, stageId: params?.stageId })

export const activityDetailPath = (id: string) => `${ROUTES.ADMIN.ACTIVITIES}/${id}`

export const activityEditPath = (id: string) => `${ROUTES.ADMIN.ACTIVITIES}/${id}/edit`

// API
// NOTE: API_BASE_URL was removed — all callers must use getApiBaseUrl() from
// ./core/services/backend-client instead. (Previously duplicated the env read
// in backendClient.ts:114 and was never imported anywhere.)

// Custom DOM events (consumed by useHeaderNotifications)
export const USERS_CHANGED_EVENT = 'kidversa:users-changed'
