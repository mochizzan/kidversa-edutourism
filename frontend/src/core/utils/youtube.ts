/**
 * YouTube URL helpers for the learner kiosk.
 *
 * A VIDEO StageContent can be sourced from an uploaded file OR a YouTube link.
 * The kiosk must render an <iframe> embed for the latter, so we normalize the
 * various accepted YouTube URL shapes into a single /embed/... form.
 */

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/

/**
 * Extracts an 11-character YouTube video id from common URL shapes:
 *   - https://www.youtube.com/watch?v=ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/embed/ID
 *   - https://www.youtube.com/shorts/ID
 * Returns null when the URL is not a recognizable YouTube link.
 */
export function extractYouTubeID(url: string): string | null {
  if (!url) return null
  const match = url.match(YOUTUBE_ID_PATTERN)
  return match?.[1] ?? null
}

/**
 * Returns a normalized YouTube embed URL for the given source URL, or null if
 * the URL is not a YouTube link (caller should fall back to the raw URL then).
 */
export function extractYouTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeID(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}
