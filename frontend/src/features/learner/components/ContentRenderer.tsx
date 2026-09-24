import type { StageContent } from '../../../core/types/entities'
import { StageContentFileType } from '../../../core/types/enums'
import { useTranslation } from 'react-i18next'
import { extractYouTubeEmbedUrl } from '../../../core/utils/youtube'

interface ContentRendererProps {
 content: StageContent
 isMuted: boolean
 onEnded: () => void
}

/**
 * Centralized, purely presentational renderer for a single StageContent item.
 *
 * It is the defense-in-depth guard against the kiosk 404: when a content item
 * has NO playable source (e.g. a VIDEO whose file_url is empty and that is not
 * a YouTube link), it renders an inline fallback and NEVER issues a media
 * request — so the `/api/media/kiosk/content/:id` path is never taken.
 */
export function ContentRenderer({ content, isMuted, onEnded }: ContentRendererProps) {
 const { t } = useTranslation()
 const isYouTube =
  content.file_type === StageContentFileType.VIDEO && !!content.youtube_url
 const hasFile = !!content.file_url

 if (content.file_type === StageContentFileType.VIDEO) {
  if (isYouTube) {
   return (
    <iframe
     key={content.id}
     src={`${extractYouTubeEmbedUrl(content.youtube_url!) ?? content.youtube_url}?autoplay=1&mute=${isMuted ? 1 : 0}`}
     className="w-full h-full border-0"
     title={content.title}
     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
     allowFullScreen
    />
   )
  }
  if (hasFile) {
   return (
    <video
     key={content.id}
     src={content.file_url}
     className="max-w-full max-h-full"
     muted={isMuted}
     controls
     onEnded={onEnded}
    />
   )
  }
 } else if (content.file_type === StageContentFileType.IMAGE && hasFile) {
  return (
   <img
    key={content.id}
    src={content.file_url}
    alt={content.title}
    className="max-w-full max-h-full object-contain"
   />
  )
 } else if (content.file_type === StageContentFileType.GAME_BUNDLE) {
  return (
   <div className="w-full h-full flex items-center justify-center">
    <iframe
     key={content.id}
     src={content.file_url}
     className="w-full h-full border-0"
     title={content.title}
     allow="fullscreen"
    />
   </div>
  )
 }

 return (
  <div className="text-center text-white/70 p-8">
   <p>{t('learner.content.invalid')}</p>
  </div>
 )
}
