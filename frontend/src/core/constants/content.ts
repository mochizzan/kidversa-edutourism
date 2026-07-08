export const CONTENT_MAX_FILE_SIZES: Record<string, number> = {
  VIDEO: 500 * 1024 * 1024,
  IMAGE: 10 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
}

export const CONTENT_FILE_ACCEPT = [
  'video/mp4', 'video/webm',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
].join(',')
