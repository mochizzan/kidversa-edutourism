export interface User {
  id: string
  tenant_id?: string | null
  email: string
  password_hash: string
  role: import('./enums').UserRole
  name: string
  phone?: string
  avatar_url?: string
  is_active: boolean
  approval_status: import('./enums').ApprovalStatus
  approved_at?: string
  approved_by?: string
  rejected_at?: string
  rejected_by?: string
  rejection_reason?: string
  created_at: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  settings_json?: Record<string, unknown>
  created_at: string
}

// Per-tenant user count returned by GET /api/tenants/stats.
export interface TenantUserCount {
  tenant_id: string
  count: number
}

export interface TenantStats {
  user_counts: TenantUserCount[]
}

export interface Program {
  id: string
  tenant_id: string
  name: string
  description?: string
  thumbnail_url?: string
  is_active: boolean
  created_at: string
}

export interface ProgramStage {
  id: string
  program_id: string
  sequence_order: number
  name: string
  description?: string
  content_type: import('./enums').ContentType
  duration_minutes: number
  is_recording_stage: boolean
  is_photo_stage: boolean
  created_at: string
}

export interface StageContent {
  id: string
  program_stage_id: string
  title: string
  file_url: string
  /**
   * Present only when the VIDEO content is sourced from YouTube instead of an
   * uploaded file. Exactly one of `file_url` / `youtube_url` is populated for VIDEO.
   */
  youtube_url?: string
  file_type: import('./enums').StageContentFileType
  duration_seconds?: number
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface PhotoFrame {
  id: string
  tenant_id: string
  program_id?: string
  name: string
  file_url: string
  thumbnail_url?: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface MissionBank {
  id: string
  program_id: string
  category: import('./enums').MissionCategory
  title_child: string
  title_parent: string
  description_parent?: string
  related_stage_ids?: string[]
  is_active: boolean
  created_at: string
}

export interface Session {
  id: string
  tenant_id: string
  program_id: string
  name: string
  session_date: string
  location: string
  status: import('./enums').SessionStatus
  notes?: string
  created_by: string
  created_at: string
}

export interface SessionStage {
  id: string
  session_id: string
  program_stage_id: string
  fasilitator_id?: string
  status: import('./enums').SessionStageStatus
  started_at?: string
  completed_at?: string
}

export interface SessionGroup {
  id: string
  session_id: string
  name: string
  status: import('./enums').GroupStatus
  current_stage_id?: string
  created_at: string
}

export interface GroupStageProgress {
  id: string
  group_id: string
  session_stage_id: string
  status: import('./enums').GroupStageProgressStatus
  entered_at?: string
  completed_at?: string
  unlocked_by?: string
  unlock_reason?: string
}

export interface Participant {
  id: string
  tenant_id?: string
  session_id?: string
  group_id?: string
  child_name: string
  child_age: number
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
  consent_recording: boolean
  consent_photo: boolean
  consent_at?: string
  created_at: string
}

export interface Assessment {
  id: string
  participant_id: string
  session_stage_id: string
  star_rating: number
  comment?: string
  assessed_by: string
  assessed_at: string
  updated_at: string
  sync_status: import('./enums').SyncStatus
}

export interface SmartPhoto {
  id: string
  participant_id: string
  session_id: string
  frame_id?: string
  original_file_url: string
  framed_file_url?: string
  is_report_photo: boolean
  taken_by: string
  taken_at: string
  sync_status: import('./enums').SyncStatus
}

export interface Recording {
  id: string
  participant_id: string
  session_stage_id: string
  file_url?: string
  duration_seconds: number
  file_size_bytes?: number
  transcript_text?: string
  emotion_tags_json?: Record<string, unknown>
  review_status: import('./enums').RecordingsReviewStatus
  reviewed_by?: string
  reviewed_at?: string
  sync_status: import('./enums').SyncStatus
  created_at: string
}

export interface Report {
  id: string
  participant_id: string
  session_id: string
  ai_narrative_draft?: string
  ai_narrative_final?: string
  mission_ids_json?: string[]
  report_pdf_url?: string
  parent_access_token: string
  status: import('./enums').ReportStatus
  generated_at?: string
  sent_at?: string
  approved_by?: string
}

export interface ParticipantMission {
  id: string
  participant_id: string
  report_id: string
  mission_bank_id: string
  is_completed: boolean
  completed_at?: string
}

export interface ConsentLog {
  id: string
  participant_id: string
  consent_type: import('./enums').ConsentType
  value: boolean
  sent_at: string
  responded_at?: string
  ip_address?: string
  user_agent?: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  old_value_json?: Record<string, unknown>
  new_value_json?: Record<string, unknown>
  reason?: string
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface SyncQueue {
  id: string
  tenant_id: string | null
  resource_type: string
  resource_id: string
  action: 'create' | 'update' | 'delete' | 'upload'
  payload_json?: Record<string, unknown>
  file_url_local?: string
  media_blob_id?: string
  status: import('./enums').SyncQueueStatus
  retry_count: number
  error_message?: string
  created_at: string
  updated_at: string
  synced_at?: string
}

// Backend notification entity returned by GET /api/notifications.
// unreadCount on the list is derived from the badge (`meta.total`).
export interface Notification {
  id: string
  tenant_id: string
  recipient_user_id: string
  type: string
  title?: string
  message?: string
  ref_id?: string
  is_read: boolean
  created_at?: string
}
