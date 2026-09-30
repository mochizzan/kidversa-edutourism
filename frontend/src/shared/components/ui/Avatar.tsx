import { useState } from 'react'
import { getMediaUrl } from '../../../core/utils/media'
import { cn } from '../../../core/utils'

// One shared, presentational avatar renderer for the whole app.
//
// users.avatar_url stores a RELATIVE ON-DISK path (e.g. "avatars/<uuid>.jpg"),
// never a servable URL — rendering it raw as <img src> resolves against the
// SPA route and 404s. The only correct source is the authenticated media
// endpoint keyed by the owning user's id, so this component owns that
// translation: src = avatar_url ? getMediaUrl('avatar', user.id) : null.
//
// Callers keep their own container styling (size, colors, borders, hover
// effects) via className — this component only owns the inner markup: the
// image when one exists, an initial-letter fallback otherwise (also used when
// the image fails to load, e.g. tenant-scoped 403/404).
export interface AvatarUser {
  id: string
  name?: string | null
  avatar_url?: string | null
}

export interface AvatarProps {
  /** User-like entity: id keys the media URL, name drives alt/fallback. */
  user: AvatarUser
  /** Outer circle styling (size, colors, borders, hover effects). */
  className?: string
  /** Inner <img> styling; defaults to a full-bleed cover image. */
  imgClassName?: string
  /** Initial-letter styling when there is no avatar (or it failed to load). */
  fallbackClassName?: string
}

const DEFAULT_CONTAINER =
  'w-10 h-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0'
const DEFAULT_IMG = 'w-full h-full object-cover rounded-full'

function initialOf(name?: string | null): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

export function Avatar({ user, className, imgClassName, fallbackClassName }: AvatarProps) {
  const src = user.avatar_url ? getMediaUrl('avatar', user.id) : null
  // Track the specific URL that failed so a different user (or a replaced
  // avatar) retries instead of staying stuck on the fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = src !== null && failedSrc !== src

  return (
    <div className={cn(DEFAULT_CONTAINER, className)}>
      {showImage ? (
        <img
          src={src}
          alt={user.name ?? ''}
          className={cn(DEFAULT_IMG, imgClassName)}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span role="img" aria-label={user.name || '?'} className={fallbackClassName}>
          {initialOf(user.name)}
        </span>
      )}
    </div>
  )
}
