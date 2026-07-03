export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN_WISATA = 'ADMIN_WISATA',
  KOORDINATOR = 'KOORDINATOR',
  FASILITATOR = 'FASILITATOR',
  PARENT = 'PARENT',
}

export enum ContentType {
  VIDEO = 'VIDEO',
  SLIDESHOW = 'SLIDESHOW',
  GAME = 'GAME',
  MIXED = 'MIXED',
}

export enum StageContentFileType {
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  GAME_BUNDLE = 'GAME_BUNDLE',
}

export enum MissionCategory {
  HOME = 'HOME',
  PARENT = 'PARENT',
  SCHOOL = 'SCHOOL',
}

export enum SessionStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SessionStageStatus {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum GroupStatus {
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum GroupStageProgressStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
}

export enum SyncStatus {
  LOCAL = 'LOCAL',
  UPLOADING = 'UPLOADING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}

export enum RecordingsReviewStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  SKIPPED = 'SKIPPED',
}

export enum ConsentType {
  RECORDING = 'RECORDING',
  PHOTO = 'PHOTO',
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
}

export enum SyncQueueDataType {
  ASSESSMENT = 'ASSESSMENT',
  PHOTO = 'PHOTO',
  RECORDING = 'RECORDING',
  PROGRESS = 'PROGRESS',
}

export enum SyncQueueStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  FAILED = 'FAILED',
}

export enum ConnectionStatus {
  CLOUD = 'CLOUD',
  EDGE = 'EDGE',
  OFFLINE = 'OFFLINE',
}
