export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STORAGE_ERROR'
  | 'OFFLINE'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public field?: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
