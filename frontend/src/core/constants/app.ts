// App Constants
export const APP_NAME = 'Kidversa'
export const APP_DESCRIPTION = 'Platform Edutourism Interaktif untuk Anak - Belajar Sambil Berpetualang!'

// Brand Colors (matched to logo)
// For dynamic JS usage. For Tailwind classes, use theme tokens: bg-primary, text-accent, etc.
export const COLORS = {
  primary: '#5B2C8D',    // Deep Purple (logo background)
  primaryLight: '#7B4DB5',
  primaryDark: '#4A2370',
  accent: '#F5A623',     // Orange/Amber (logo accent)
  accentLight: '#FFC04D',
  accentDark: '#D48B1C',
  white: '#FFFFFF',
  black: '#000000',
} as const

// Routes
export const ROUTES = {
  HOME: '/',
  AUTH: {
    BASE: '/auth',
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
  },
  ADMIN: {
    BASE: '/admin',
    DASHBOARD: '/admin/dashboard',
    LIVE: '/admin/live',
    PROGRAMS: '/admin/programs',
    PROGRAM_NEW: '/admin/programs/new',
    SESSIONS: '/admin/sessions',
    SESSION_NEW: '/admin/sessions/new',
    PARTICIPANTS: '/admin/participants',
    PARTICIPANT_NEW: '/admin/participants/new',
    REPORTS: '/admin/reports',
    MISSIONS: '/admin/missions',
    MISSION_NEW: '/admin/missions/new',
    CONTENT: '/admin/content',
    CONTENT_NEW: '/admin/content/new',
    FRAMES: '/admin/frames',
    FRAME_UPLOAD: '/admin/frames/upload',
    RECORDINGS: '/admin/recordings',
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
  },
  PARENT: {
    BASE: '/parent',
    REPORT: '/parent/report',
    CONSENT: '/parent/consent',
    MISSIONS: '/parent/missions',
  },
} as const

// Parameterized path builders (backward-compatible)
export const programListPath = () => ROUTES.ADMIN.PROGRAMS
export const programDetailPath = (id: string) => `${ROUTES.ADMIN.PROGRAMS}/${id}`
export const programStagePath = (programId: string, stageId: string) =>
  `${ROUTES.ADMIN.PROGRAMS}/${programId}/stages/${stageId}`

export const contentNewPath = (params?: { programId?: string; stageId?: string }) => {
  const base = ROUTES.ADMIN.CONTENT_NEW
  if (!params?.programId) return base
  const q = new URLSearchParams()
  q.set('programId', params.programId)
  if (params.stageId) q.set('stageId', params.stageId)
  return `${base}?${q.toString()}`
}

export const contentEditPath = (contentId: string, params?: { programId?: string; stageId?: string }) => {
  const base = `${ROUTES.ADMIN.CONTENT}/${contentId}/edit`
  if (!params?.programId) return base
  const q = new URLSearchParams()
  q.set('programId', params.programId)
  if (params.stageId) q.set('stageId', params.stageId)
  return `${base}?${q.toString()}`
}

// API
// NOTE: API_BASE_URL was removed — all callers must use getApiBaseUrl() from
// ./core/services/backendClient instead. (Previously duplicated the env read
// in backendClient.ts:114 and was never imported anywhere.)

// Custom DOM events (consumed by useHeaderNotifications)
export const USERS_CHANGED_EVENT = 'kidversa:users-changed'
