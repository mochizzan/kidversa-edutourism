import { useEffect, useState } from 'react'
import { Award, Loader2, Star } from 'lucide-react'
import { Card } from '../ui/Card'
import { badgeService } from '../../../core/services/badges'
import { getMediaUrl } from '../../../core/utils/media'
import type { ParticipantBadge } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

interface BadgeListProps {
  participantId: string | undefined
}

// Renders the child's earned badges: per-SubTopik (SUBTOPIK) and the cross-
// session Final Program award (FINAL). Badge images are served through the
// authenticated, tenant-scoped media endpoint (kind "content").
export function BadgeList({ participantId }: BadgeListProps) {
  const [badges, setBadges] = useState<ParticipantBadge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!participantId) return
    let alive = true
    setLoading(true)
    setError(null)
    badgeService
      .listByParticipant(participantId)
      .then((list) => {
        if (alive) setBadges(list)
      })
      .catch((err) => {
        if (alive) setError(friendlyError(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [participantId])

  const subtopik = badges.filter((b) => b.badge_type === 'SUBTOPIK')
  const finalBadge = badges.find((b) => b.badge_type === 'FINAL')

  if (loading) {
    return (
      <Card className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </Card>
    )
  }

  if (error) {
    // The badges endpoint is staff-only; non-staff callers (e.g. parent access
    // tokens) are rejected. Degrade gracefully to the empty state instead of
    // surfacing an auth error on a shared/parent-facing view.
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Award className="w-4 h-4" />
          Belum ada badge yang diraih.
        </div>
      </Card>
    )
  }

  if (badges.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Award className="w-4 h-4" />
          Belum ada badge yang diraih.
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {finalBadge && (
        <Card className="bg-primary-container/40 border border-primary/30">
          <div className="flex items-center gap-4">
            {finalBadge.badge_image_url ? (
              <img
                src={getMediaUrl('content', finalBadge.badge_image_url)}
                alt={finalBadge.badge_name}
                className="w-16 h-16 object-contain rounded-xl"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary-container flex items-center justify-center">
                <Award className="w-8 h-8 text-primary" />
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-on-surface-variant">Badge Final Program</p>
              <p className="text-lg font-bold text-on-surface">{finalBadge.badge_name}</p>
            </div>
          </div>
        </Card>
      )}

      {subtopik.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-on-surface mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-accent" />
            Badge Topik
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {subtopik.map((b) => (
              <div
                key={b.id}
                className="flex flex-col items-center text-center p-3 rounded-xl bg-surface-variant"
              >
                {b.badge_image_url ? (
                  <img
                    src={getMediaUrl('content', b.badge_image_url)}
                    alt={b.badge_name}
                    className="w-14 h-14 object-contain rounded-lg mb-2"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-primary-container flex items-center justify-center mb-2">
                    <Award className="w-7 h-7 text-primary" />
                  </div>
                )}
                <p className="text-xs font-medium text-on-surface">{b.badge_name}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
