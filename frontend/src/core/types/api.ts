import type { ContentType, SessionStatus, UserRole } from './enums'

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ListParams {
  page?: number
  limit?: number
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
  filters?: Record<string, string | boolean | undefined>
}

export interface CreateProgramDTO {
  name: string
  description?: string
  thumbnail_url?: string
}

export interface UpdateProgramDTO extends Partial<CreateProgramDTO> {
  is_active?: boolean
}

export interface CreateStageDTO {
  sequence_order: number
  name: string
  description?: string
  content_type: ContentType
  duration_minutes: number
  is_recording_stage?: boolean
  is_photo_stage?: boolean
}

export interface UpdateStageDTO extends Partial<CreateStageDTO> {
  sequence_order?: number
}

export interface CreateSessionDTO {
  program_id: string
  name: string
  session_date: string
  location: string
  notes?: string
}

export interface UpdateSessionDTO extends Partial<CreateSessionDTO> {
  status?: SessionStatus
}

export interface CreateParticipantDTO {
  child_name: string
  child_age: number
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
  group_id?: string
}

export interface CreateUserDTO {
  tenant_id: string
  email: string
  password?: string
  role: UserRole
  name: string
  phone?: string
  avatar_url?: string
}

export interface UpdateUserDTO extends Partial<CreateUserDTO> {
  is_active?: boolean
  avatar_url?: string
}

export interface CreateAssessmentDTO {
  participant_id: string
  session_stage_id: string
  star_rating: number
  comment?: string
}

export interface LoginDTO {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  user: import('./entities').User
}

export interface CreateMissionBankDTO {
  program_id: string
  category: import('./enums').MissionCategory
  title_child: string
  title_parent: string
  description_parent?: string
  related_stage_ids?: string[]
}
