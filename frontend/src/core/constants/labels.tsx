import { ContentType, StageContentFileType } from '../types/enums'
import { Video, Image, Gamepad2 } from 'lucide-react'
import type { ReactNode } from 'react'

export const CONTENT_TYPE_LABELS = {
  [ContentType.VIDEO]: 'admin.contentType.video',
  [ContentType.SLIDESHOW]: 'admin.contentType.slideshow',
  [ContentType.GAME]: 'admin.contentType.game',
  [ContentType.MIXED]: 'admin.contentType.mixed',
} as const satisfies Record<ContentType, string>

export const STAGE_CONTENT_FILE_TYPE_LABELS = {
  [StageContentFileType.VIDEO]: 'admin.contentType.video',
  [StageContentFileType.IMAGE]: 'admin.contentType.image',
  [StageContentFileType.GAME_BUNDLE]: 'admin.contentType.game',
} as const satisfies Record<StageContentFileType, string>

/** Label for a VIDEO content sourced from YouTube instead of an uploaded file. */
export const YOUTUBE_LABEL = 'YouTube'

export const STAGE_CONTENT_FILE_TYPE_ICONS: Record<StageContentFileType, ReactNode> = {
  [StageContentFileType.VIDEO]: <Video className="w-4 h-4" />,
  [StageContentFileType.IMAGE]: <Image className="w-4 h-4" />,
  [StageContentFileType.GAME_BUNDLE]: <Gamepad2 className="w-4 h-4" />,
}
