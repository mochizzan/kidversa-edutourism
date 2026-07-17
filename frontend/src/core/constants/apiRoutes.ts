/**
 * Centralized API route registry.
 *
 * Nested namespaces mirror the backend router.go group hierarchy.
 * Builder functions encapsulate encodeURIComponent for parameterized paths.
 * Static paths are plain strings.
 */

export const API_ROUTES = {
  HEALTH: '/health',

  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
  },

  CONSENT: {
    LIST: '/api/consent',
    BY_SESSION: (sessionId: string) =>
      `/api/consent?session_id=${encodeURIComponent(sessionId)}`,
    BY_PARTICIPANT: (participantId: string) =>
      `/api/consent?participant_id=${encodeURIComponent(participantId)}`,
    SEND_WHATSAPP: '/api/consent/send-whatsapp',
    SEND_WHATSAPP_STREAM: (batchId: string) =>
      `/api/consent/send-whatsapp/stream?batch_id=${encodeURIComponent(batchId)}`,
    RESPOND_COMBINED: '/api/consent/respond-combined',
    INFO: (token: string) => `/api/consent/info?token=${encodeURIComponent(token)}`,
    SUMMARY: '/api/consent/summary',
  },

  SESSIONS: {
    BASE: '/api/sessions',
    DETAIL: (id: string) => `/api/sessions/${encodeURIComponent(id)}`,
    START: (id: string) => `/api/sessions/${encodeURIComponent(id)}/start`,
    COMPLETE: (id: string) => `/api/sessions/${encodeURIComponent(id)}/complete`,
    CANCEL: (id: string) => `/api/sessions/${encodeURIComponent(id)}/cancel`,
    STAGES: (sessionId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/stages`,
    ASSIGN_STAGE: (sessionId: string, stageId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/stages/${encodeURIComponent(stageId)}/assign`,
    GROUPS: (sessionId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/groups`,
    GROUP_DETAIL: (sessionId: string, groupId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/groups/${encodeURIComponent(groupId)}`,
    PARTICIPANTS: (sessionId: string, groupId?: string) => {
      const base = `/api/sessions/${encodeURIComponent(sessionId)}/participants`
      return groupId ? `${base}?group_id=${encodeURIComponent(groupId)}` : base
    },
    PARTICIPANT_DETAIL: (sessionId: string, participantId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(participantId)}`,
    LINK_PARTICIPANT: (sessionId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/participants/link`,
    IMPORT_PARTICIPANTS: (sessionId: string) =>
      `/api/sessions/${encodeURIComponent(sessionId)}/participants/import`,
  },

  PARTICIPANTS: {
    BASE: '/api/participants',
    DETAIL: (id: string) => `/api/participants/${encodeURIComponent(id)}`,
  },

  PROGRAMS: {
    BASE: '/api/programs',
    DETAIL: (id: string) => `/api/programs/${encodeURIComponent(id)}`,
    STAGES: (programId: string) =>
      `/api/programs/${encodeURIComponent(programId)}/stages`,
    STAGE_DETAIL: (programId: string, stageId: string) =>
      `/api/programs/${encodeURIComponent(programId)}/stages/${encodeURIComponent(stageId)}`,
    REORDER_STAGES: (programId: string) =>
      `/api/programs/${encodeURIComponent(programId)}/stages/reorder`,
    TOGGLE_ACTIVE: (id: string) =>
      `/api/programs/${encodeURIComponent(id)}/toggle-active`,
    CONTENTS: (stageId: string) =>
      `/api/programs/program-stages/${encodeURIComponent(stageId)}/contents`,
    CONTENT_DETAIL: (stageId: string, contentId: string) =>
      `/api/programs/program-stages/${encodeURIComponent(stageId)}/contents/${encodeURIComponent(contentId)}`,
    REORDER_CONTENTS: (stageId: string) =>
      `/api/programs/program-stages/${encodeURIComponent(stageId)}/contents/reorder`,
  },

  PROGRAM_STAGES: {
    CONTENTS_UPLOAD: (stageId: string) =>
      `/api/program-stages/${encodeURIComponent(stageId)}/contents/upload`,
  },

  USERS: {
    BASE: '/api/users',
    DETAIL: (id: string) => `/api/users/${encodeURIComponent(id)}`,
    APPROVE: (id: string) => `/api/users/${encodeURIComponent(id)}/approve`,
    REJECT: (id: string) => `/api/users/${encodeURIComponent(id)}/reject`,
    DEACTIVATE: (id: string) => `/api/users/${encodeURIComponent(id)}/deactivate`,
    AVATAR: (id: string) => `/api/users/${encodeURIComponent(id)}/avatar`,
  },

  TENANTS: {
    BASE: '/api/tenants',
    STATS: '/api/tenants/stats',
    DETAIL: (id: string) => `/api/tenants/${encodeURIComponent(id)}`,
  },

  PHOTOS: {
    BASE: '/api/photos',
    DETAIL: (id: string) => `/api/photos/${encodeURIComponent(id)}`,
    SET_REPORT: (id: string) => `/api/photos/${encodeURIComponent(id)}/set-report-photo`,
    UPLOAD: '/api/photos/upload',
  },

  RECORDINGS: {
    BASE: '/api/recordings',
    DETAIL: (id: string) => `/api/recordings/${encodeURIComponent(id)}`,
    REVIEW: (id: string) => `/api/recordings/${encodeURIComponent(id)}/review`,
    UPLOAD: '/api/recordings/upload',
  },

  FRAMES: {
    BASE: '/api/frames',
    DETAIL: (id: string) => `/api/frames/${encodeURIComponent(id)}`,
    DEACTIVATE: (id: string) => `/api/frames/${encodeURIComponent(id)}/deactivate`,
    UPLOAD: '/api/frames/upload',
  },

  REPORTS: {
    BASE: '/api/reports',
    DETAIL: (id: string) => `/api/reports/${encodeURIComponent(id)}`,
    BY_SESSION: (sessionId: string) =>
      `/api/reports?session_id=${encodeURIComponent(sessionId)}`,
    GENERATE: (id: string) => `/api/reports/${encodeURIComponent(id)}/generate`,
    APPROVE: (id: string) => `/api/reports/${encodeURIComponent(id)}/approve`,
    SEND: (id: string) => `/api/reports/${encodeURIComponent(id)}/send`,
    REVOKE_TOKEN: (id: string) => `/api/reports/${encodeURIComponent(id)}/revoke-token`,
    NARRATIVE_STREAM: (id: string) => `/api/reports/${encodeURIComponent(id)}/narrative-stream`,
    ACCESS: '/api/reports/access',
  },

  MISSIONS: {
    BASE: '/api/mission-banks',
    DETAIL: (id: string) => `/api/mission-banks/${encodeURIComponent(id)}`,
    TOGGLE_ACTIVE: (id: string) => `/api/mission-banks/${encodeURIComponent(id)}/toggle-active`,
  },

  PARTICIPANT_MISSIONS: {
    BASE: '/api/participant-missions',
    DETAIL: (id: string) => `/api/participant-missions/${encodeURIComponent(id)}`,
    TOGGLE: (id: string) => `/api/participant-missions/${encodeURIComponent(id)}/toggle`,
    BY_REPORT: (reportId: string) =>
      `/api/participant-missions?report_id=${encodeURIComponent(reportId)}`,
    BY_PARTICIPANT: (participantId: string) =>
      `/api/participant-missions?participant_id=${encodeURIComponent(participantId)}`,
    REPLACE: '/api/participant-missions/replace',
  },

  ASSESSMENTS: {
    BASE: '/api/assessments',
    BY_PARTICIPANT: (participantId: string) =>
      `/api/assessments?participant_id=${encodeURIComponent(participantId)}`,
    BY_SESSION: (sessionId: string) =>
      `/api/assessments?session_id=${encodeURIComponent(sessionId)}`,
  },

  NOTIFICATIONS: {
    BASE: '/api/notifications',
    READ_ALL: '/api/notifications/read-all',
    READ: (id: string) => `/api/notifications/${encodeURIComponent(id)}/read`,
  },

  LIVE: {
    STREAM: (sessionId: string) => `/api/live/${encodeURIComponent(sessionId)}/stream`,
    GROUPS: (sessionId: string) => `/api/live/${encodeURIComponent(sessionId)}/groups`,
    TIMELINE: (sessionId: string) => `/api/live/${encodeURIComponent(sessionId)}/timeline`,
    UNLOCK_STAGE: (groupId: string, stageId: string) =>
      `/api/live/groups/${encodeURIComponent(groupId)}/stages/${encodeURIComponent(stageId)}/unlock`,
    COMPLETE_STAGE: (groupId: string, stageId: string) =>
      `/api/live/groups/${encodeURIComponent(groupId)}/stages/${encodeURIComponent(stageId)}/complete`,
    SKIP_STAGE: (groupId: string, stageId: string) =>
      `/api/live/groups/${encodeURIComponent(groupId)}/stages/${encodeURIComponent(stageId)}/skip`,
    JUMP: (groupId: string) => `/api/live/groups/${encodeURIComponent(groupId)}/jump`,
    RESET: (groupId: string) => `/api/live/groups/${encodeURIComponent(groupId)}/reset`,
    EVENTS: '/api/live/events',
  },

  UPLOAD: {
    CONTENT: '/api/program-stages',
  },

  MEDIA: {
    BASE: '/api/media',
  },
} as const
