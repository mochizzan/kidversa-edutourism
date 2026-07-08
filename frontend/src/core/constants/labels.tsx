import { ContentType, StageContentFileType } from '../types/enums'
import { Video, Image, Music, Gamepad2 } from 'lucide-react'
import type { ReactNode } from 'react'

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  [ContentType.VIDEO]: 'Video',
  [ContentType.SLIDESHOW]: 'Slideshow',
  [ContentType.GAME]: 'Game',
  [ContentType.MIXED]: 'Mixed',
}

export const STAGE_CONTENT_FILE_TYPE_LABELS: Record<StageContentFileType, string> = {
  [StageContentFileType.VIDEO]: 'Video',
  [StageContentFileType.IMAGE]: 'Gambar',
  [StageContentFileType.AUDIO]: 'Audio',
  [StageContentFileType.GAME_BUNDLE]: 'Game',
}

export const STAGE_CONTENT_FILE_TYPE_ICONS: Record<StageContentFileType, ReactNode> = {
  [StageContentFileType.VIDEO]: <Video className="w-4 h-4" />,
  [StageContentFileType.IMAGE]: <Image className="w-4 h-4" />,
  [StageContentFileType.AUDIO]: <Music className="w-4 h-4" />,
  [StageContentFileType.GAME_BUNDLE]: <Gamepad2 className="w-4 h-4" />,
}
