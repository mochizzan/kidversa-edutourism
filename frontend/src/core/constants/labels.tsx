import { ContentType } from '../types/enums'

export const CONTENT_TYPE_LABELS = {
  [ContentType.VIDEO]: 'admin.contentType.video',
  [ContentType.SLIDESHOW]: 'admin.contentType.slideshow',
  [ContentType.GAME]: 'admin.contentType.game',
  [ContentType.MIXED]: 'admin.contentType.mixed',
} as const satisfies Record<ContentType, string>
