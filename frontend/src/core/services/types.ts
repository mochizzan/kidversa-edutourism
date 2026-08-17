import type { PaginatedResponse, ListParams } from '../types'
import type {
  Program,
  ProgramStage,
  CreateProgramDTO,
  UpdateProgramDTO,
  ToggleActiveResult,
  CreateStageDTO,
  UpdateStageDTO,
  StageContent,
  StageContentFileType,
  Content,
  ContentUsage,
  Session,
  SessionStage,
  CreateSessionDTO,
  UpdateSessionDTO,
  SessionGroup,
  Participant,
  CreateParticipantDTO,
  User,
  CreateUserDTO,
  UpdateUserDTO,
  PhotoFrame,
  SmartPhoto,
  Recording,
  Report,
  ConsentLog,
  Assessment,
  CreateAssessmentDTO,
  MissionBank,
  CreateMissionBankDTO,
  LoginDTO,
  LoginResponse,
} from '../types'

// Programs
export interface ProgramService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Program>>
  getById(id: string): Promise<Program | null>
  create(data: CreateProgramDTO): Promise<Program>
  update(id: string, data: UpdateProgramDTO): Promise<Program>
  toggleActive(id: string): Promise<ToggleActiveResult>
  delete(id: string): Promise<void>

  getStages(programId: string): Promise<ProgramStage[]>
  createStage(programId: string, data: CreateStageDTO): Promise<ProgramStage>
  updateStage(programId: string, stageId: string, data: UpdateStageDTO): Promise<ProgramStage>
  deleteStage(programId: string, stageId: string): Promise<void>
  reorderStages(programId: string, stageIds: string[]): Promise<void>

  getContents(stageId: string): Promise<StageContent[]>
  reorderContents(stageId: string, contentIds: string[]): Promise<void>
  assignContent(stageId: string, contentId: string): Promise<void>
  unassignContent(stageId: string, contentId: string): Promise<void>
}

// Standalone, tenant-scoped content CRUD + usage/assign (Content Single-Source).
export interface ContentService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Content>>
  getById(id: string): Promise<Content | null>
  create(data: { title: string; file_url: string; youtube_url?: string; file_type: StageContentFileType; duration_seconds?: number }): Promise<Content>
  update(id: string, data: Partial<{ title: string; file_url: string; youtube_url?: string; file_type: StageContentFileType; duration_seconds?: number }>): Promise<Content>
  remove(id: string): Promise<void>
  getUsage(id: string): Promise<ContentUsage[]>
  upload(data: { file: File; title: string; file_type: StageContentFileType; duration_seconds?: number; youtube_url?: string }): Promise<Content>
  replaceFile(id: string, data: { file: File; title?: string; file_type?: StageContentFileType; duration_seconds?: number }): Promise<Content>
}

// Sessions
export interface SessionService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Session>>
  getById(id: string): Promise<Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] } | null>
  create(data: CreateSessionDTO): Promise<Session>
  update(id: string, data: UpdateSessionDTO): Promise<Session>
  start(id: string): Promise<Session>
  complete(id: string): Promise<Session>
  cancel(id: string): Promise<Session>
  delete(id: string): Promise<void>

  getStages(sessionId: string): Promise<SessionStage[]>
  getGroups(sessionId: string): Promise<SessionGroup[]>

  createGroup(sessionId: string, name: string): Promise<SessionGroup>
  updateGroup(sessionId: string, groupId: string, data: { name: string; facilitatorId: string | null }): Promise<SessionGroup>
  deleteGroup(sessionId: string, groupId: string): Promise<void>

  getParticipants(sessionId: string, groupId?: string): Promise<Participant[]>
  getParticipantById(participantId: string): Promise<Participant | null>
  addParticipant(sessionId: string, groupId: string, data: CreateParticipantDTO): Promise<Participant>
  linkParticipant(sessionId: string, groupId: string, participantId: string): Promise<import('../types').LinkParticipantResponse>
  updateParticipant(sessionId: string, participantId: string, data: Partial<CreateParticipantDTO>): Promise<Participant>
  removeParticipant(sessionId: string, participantId: string): Promise<void>
  importParticipants(sessionId: string, rows: CreateParticipantDTO[]): Promise<import('../types').ImportResult>
  getLinkableParticipants(sessionId: string): Promise<import('../types').ParticipantSessionInfo[]>
}

// Participants
export interface ParticipantService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Participant>>
  getById(id: string): Promise<Participant | null>
  create(data: CreateParticipantDTO): Promise<Participant>
}

// Users
export interface UserService {
  getAll(params?: ListParams): Promise<PaginatedResponse<User>>
  getById(id: string): Promise<User | null>
  create(data: CreateUserDTO): Promise<User>
  update(id: string, data: UpdateUserDTO): Promise<User>
  deactivate(id: string): Promise<User>
  approve(userId: string, approverId: string): Promise<User>
  reject(userId: string, approverId: string, reason?: string): Promise<User>
  remove(userId: string): Promise<void>
  uploadAvatar(id: string, file: File): Promise<User>
}

// Frames
export interface FrameService {
  getAll(params?: ListParams): Promise<PaginatedResponse<PhotoFrame>>
  getById(id: string): Promise<PhotoFrame | null>
  create(data: Omit<PhotoFrame, 'id' | 'created_at'>): Promise<PhotoFrame>
  update(id: string, data: Partial<Omit<PhotoFrame, 'id' | 'created_at'>>): Promise<PhotoFrame>
  deactivate(id: string): Promise<PhotoFrame>
  upload(data: { name: string; programId?: string; file: File }): Promise<PhotoFrame>
}

// Photos
export interface PhotoService {
  getBySession(sessionId: string): Promise<SmartPhoto[]>
  getByParticipant(participantId: string): Promise<SmartPhoto[]>
  upload(participantId: string, sessionId: string, file: File): Promise<SmartPhoto>
  update(photoId: string, data: Partial<SmartPhoto>): Promise<SmartPhoto>
  delete(id: string): Promise<void>
}

// Recordings
export interface RecordingService {
  getBySession(sessionId: string): Promise<Recording[]>
  getByParticipant(participantId: string): Promise<Recording[]>
  getById(id: string): Promise<Recording | null>
  update(id: string, data: Partial<Recording>): Promise<Recording>
  upload(participantId: string, sessionStageId: string, file: File): Promise<Recording>
  delete(id: string): Promise<void>
}

// Reports
export interface ReportTokenResponse {
  id: string
  parent_access_token: string
  token_expires_at?: string | null
  status: string
}

export interface ReportService {
  getBySession(sessionId: string): Promise<Report[]>
  getById(id: string): Promise<Report | null>
  generate(sessionId: string): Promise<Report[]>
  approve(
    reportId: string,
    data?: { narrative_final?: string; mission_ids?: string[] },
    tenantId?: string | null,
  ): Promise<Report>
  send(reportId: string, tenantId?: string | null): Promise<ReportTokenResponse>
  generateNarrativeStream(reportId: string, force?: boolean, tenantId?: string | null): Promise<void>
}

// Consent
export interface ConsentParticipantResult {
  participant_id: string
  child_name: string
  parent_phone: string
  status: 'sent' | 'failed' | 'skipped'
  error?: string
}

export interface ConsentSendWhatsAppResponse {
  status: 'queued'
  batch_id: string
  total: number
}

export interface ConsentProgressEvent {
  type: 'progress' | 'done'
  data: {
    participant_id?: string
    child_name?: string
    status?: string
    error?: string
    sent?: number
    failed?: number
    total?: number
  }
}

export interface ConsentService {
  sendViaWhatsApp(sessionId: string, force?: boolean): Promise<ConsentSendWhatsAppResponse>
  submitCombined(token: string, recording: boolean, photo: boolean): Promise<void>
  getBySession(sessionId: string): Promise<ConsentLog[]>
  getSummary(sessionIds: string[]): Promise<Record<string, ConsentLog[]>>
  getInfo(token: string): Promise<ConsentInfo>
}

export interface ConsentInfo {
  status: 'ok' | 'invalid' | 'expired' | 'consumed'
  child_name?: string
  parent_name?: string
  session_name?: string
  session_date?: string
  location?: string
}

// Assessments
export interface AssessmentService {
  upsert(data: CreateAssessmentDTO): Promise<Assessment>
  bulkUpsert(data: CreateAssessmentDTO[]): Promise<Assessment[]>
  getByParticipant(participantId: string): Promise<Assessment[]>
  getBySession(sessionId: string): Promise<Assessment[]>
}

// Auth
export interface AuthService {
  login(data: LoginDTO): Promise<LoginResponse>
  refresh(refreshToken: string): Promise<LoginResponse>
  logout(): Promise<void>
  getMe(): Promise<User>
  generateKioskToken(sessionId: string): Promise<{ access_token: string }>
  generateParentToken(reportId: string): Promise<{ access_token: string }>
}

// Mission Bank
export interface MissionBankService {
  getAll(params?: {
    page?: number
    limit?: number
    search?: string
    filters?: Record<string, string | boolean | undefined>
  }): Promise<{ data: MissionBank[]; total: number; page: number; limit: number; totalPages: number }>
  getById(id: string): Promise<MissionBank | null>
  create(data: CreateMissionBankDTO): Promise<MissionBank>
  update(id: string, data: Partial<CreateMissionBankDTO>): Promise<MissionBank>
  delete(id: string): Promise<void>
  toggleActive(id: string): Promise<MissionBank>
}
