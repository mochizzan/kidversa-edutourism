import type { PaginatedResponse, ListParams } from '../types'
import type {
  Program,
  ProgramStage,
  CreateProgramDTO,
  UpdateProgramDTO,
  CreateStageDTO,
  UpdateStageDTO,
  StageContent,
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
} from '../types'

// Programs
export interface ProgramService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Program>>
  getById(id: string): Promise<Program | null>
  create(data: CreateProgramDTO): Promise<Program>
  update(id: string, data: UpdateProgramDTO): Promise<Program>
  toggleActive(id: string): Promise<Program>
  delete(id: string): Promise<void>

  getStages(programId: string): Promise<ProgramStage[]>
  createStage(programId: string, data: CreateStageDTO): Promise<ProgramStage>
  updateStage(programId: string, stageId: string, data: UpdateStageDTO): Promise<ProgramStage>
  deleteStage(programId: string, stageId: string): Promise<void>
  reorderStages(programId: string, stageIds: string[]): Promise<void>

  getContents(stageId: string): Promise<StageContent[]>
  createContent(stageId: string, data: Omit<StageContent, 'id' | 'program_stage_id' | 'created_at'>): Promise<StageContent>
  updateContent(stageId: string, contentId: string, data: Partial<Omit<StageContent, 'id' | 'program_stage_id' | 'created_at'>>): Promise<StageContent>
  deleteContent(stageId: string, contentId: string): Promise<void>
  reorderContents(stageId: string, contentIds: string[]): Promise<void>
}

// Sessions
export interface SessionService {
  getAll(params?: ListParams): Promise<PaginatedResponse<Session>>
  getById(id: string): Promise<Session & { stages: SessionStage[]; groups: SessionGroup[] } | null>
  create(data: CreateSessionDTO): Promise<Session>
  update(id: string, data: UpdateSessionDTO): Promise<Session>
  start(id: string): Promise<Session>
  complete(id: string): Promise<Session>
  cancel(id: string): Promise<Session>

  assignFacilitator(sessionId: string, stageId: string, userId: string): Promise<SessionStage>
  getStages(sessionId: string): Promise<SessionStage[]>
  getGroups(sessionId: string): Promise<SessionGroup[]>

  createGroup(sessionId: string, name: string): Promise<SessionGroup>
  updateGroup(sessionId: string, groupId: string, name: string): Promise<SessionGroup>
  deleteGroup(sessionId: string, groupId: string): Promise<void>

  getParticipants(sessionId: string, groupId?: string): Promise<Participant[]>
  addParticipant(sessionId: string, groupId: string, data: CreateParticipantDTO): Promise<Participant>
  updateParticipant(sessionId: string, participantId: string, data: Partial<CreateParticipantDTO>): Promise<Participant>
  removeParticipant(sessionId: string, participantId: string): Promise<void>
  importParticipants(sessionId: string, rows: CreateParticipantDTO[]): Promise<Participant[]>
}

// Users
export interface UserService {
  getAll(params?: ListParams): Promise<PaginatedResponse<User>>
  getById(id: string): Promise<User | null>
  create(data: CreateUserDTO): Promise<User>
  update(id: string, data: UpdateUserDTO): Promise<User>
  deactivate(id: string): Promise<User>
}

// Frames
export interface FrameService {
  getAll(params?: ListParams): Promise<PaginatedResponse<PhotoFrame>>
  getById(id: string): Promise<PhotoFrame | null>
  create(data: Omit<PhotoFrame, 'id' | 'created_at'>): Promise<PhotoFrame>
  update(id: string, data: Partial<Omit<PhotoFrame, 'id' | 'created_at'>>): Promise<PhotoFrame>
  deactivate(id: string): Promise<PhotoFrame>
}

// Photos
export interface PhotoService {
  getBySession(sessionId: string): Promise<SmartPhoto[]>
  getByParticipant(participantId: string): Promise<SmartPhoto[]>
  upload(participantId: string, sessionId: string, file: File): Promise<SmartPhoto>
  setReportPhoto(photoId: string, isReportPhoto: boolean): Promise<SmartPhoto>
  delete(id: string): Promise<void>
}

// Recordings
export interface RecordingService {
  getBySession(sessionId: string): Promise<Recording[]>
  getByParticipant(participantId: string): Promise<Recording[]>
  upload(participantId: string, sessionStageId: string, file: File): Promise<Recording>
  delete(id: string): Promise<void>
}

// Reports
export interface ReportService {
  getBySession(sessionId: string): Promise<Report[]>
  getById(id: string): Promise<Report | null>
  generate(sessionId: string): Promise<Report[]>
  approve(reportId: string): Promise<Report>
  send(reportId: string): Promise<Report>
}

// Consent
export interface ConsentService {
  sendRequest(sessionId: string): Promise<void>
  getBySession(sessionId: string): Promise<ConsentLog[]>
  submit(token: string, recording: boolean, photo: boolean): Promise<void>
}

// Live session
export interface LiveSessionEvent {
  type: 'group:progress' | 'group:completed' | 'stage:unlock' | 'connection:change'
  payload: Record<string, unknown>
}

export interface LiveSessionService {
  connect(sessionId: string): EventSource
}
