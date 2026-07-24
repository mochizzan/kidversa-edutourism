import { StageContentFileType, ContentType } from '../types/enums'
import type { StageContent } from '../types'
import type { ProgramService } from '../services/types'
import { getMediaUrl } from './media'
import { extractYouTubeID } from './youtube'

export function autoDetectFileType(file: File): StageContentFileType {
  if (file.type.startsWith('video/')) return StageContentFileType.VIDEO
  if (file.type.startsWith('image/')) return StageContentFileType.IMAGE
  if (file.type.startsWith('audio/')) return StageContentFileType.AUDIO
  return StageContentFileType.GAME_BUNDLE
}

export function getMediaDuration(file: File): Promise<number> {
  if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
    return Promise.resolve(0)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = file.type.startsWith('video/')
      ? document.createElement('video')
      : document.createElement('audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      resolve(Math.ceil(el.duration))
      URL.revokeObjectURL(url)
    }
    el.onerror = () => { resolve(0); URL.revokeObjectURL(url) }
    el.src = url
  })
}

export function detectContentType(contents: StageContent[]): ContentType {
  if (contents.length === 0) return ContentType.MIXED
  const types = new Set(contents.map(c => c.file_type))
  if (types.size === 1) {
    const only = [...types][0]
    if (only === 'IMAGE') return ContentType.SLIDESHOW
    if (only === 'VIDEO') return ContentType.VIDEO
    if (only === 'GAME_BUNDLE') return ContentType.GAME
  }
  return ContentType.MIXED
}

export function computeDurationMinutes(contents: StageContent[]): number {
  const totalSeconds = contents
    .filter(c => c.file_type === 'VIDEO' || c.file_type === 'AUDIO')
    .reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0)
  return Math.ceil(totalSeconds / 60)
}

export async function syncStageMeta(
  programService: ProgramService,
  programId: string,
  stageId: string,
): Promise<void> {
  const contents = await programService.getContents(stageId)
  await programService.updateStage(programId, stageId, {
    content_type: detectContentType(contents),
    duration_minutes: computeDurationMinutes(contents),
  })
}

export type ContentThumbnail = { type: 'image'; src: string } | { type: 'video'; src: string } | { type: 'icon'; src: null }

export function getContentThumbnailSrc(content: StageContent, tenantId?: string): ContentThumbnail {
  const suffix = tenantId ? `?tenant_id=${tenantId}` : ''

  if (content.file_type === StageContentFileType.VIDEO && content.youtube_url) {
    const videoId = extractYouTubeID(content.youtube_url)
    if (videoId) {
      return { type: 'image', src: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }
    }
  }

  if (content.file_type === StageContentFileType.IMAGE && content.file_url) {
    return { type: 'image', src: `${getMediaUrl('content', content.id)}${suffix}` }
  }

  if (content.file_type === StageContentFileType.VIDEO && content.file_url) {
    return { type: 'video', src: `${getMediaUrl('content', content.id)}${suffix}` }
  }

  return { type: 'icon', src: null }
}
