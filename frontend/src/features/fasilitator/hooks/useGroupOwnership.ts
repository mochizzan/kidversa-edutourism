import { useState, useEffect } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import type { SessionGroup } from '../../../core/types'

// Opsi A: a FASILITATOR may act only on groups they own (group.facilitator_id).
// ADMIN/KOORDINATOR/SUPER_ADMIN bypass the ownership gate. The backend enforces
// this too; this hook only drives the read-only UI on child/photo/recording pages.
export function useGroupOwnership(childId: string | undefined) {
  const { user } = useAuth()
  const [group, setGroup] = useState<SessionGroup | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!childId) {
      setLoading(false)
      return
    }
    setLoading(true)
    sessionService
      .getParticipantById(childId)
      .then(async (part) => {
        if (cancelled || !part?.session_id || !part.group_id) {
          if (!cancelled) setGroup(undefined)
          return
        }
        const detail = await sessionService.getById(part.session_id)
        if (cancelled) return
        setGroup(detail?.groups.find((g) => g.id === part.group_id))
      })
      .catch(() => {
        if (!cancelled) setGroup(undefined)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [childId])

  const isMine =
    !user ||
    user.role !== 'FASILITATOR' ||
    group?.facilitator_id === user.id

  return { group, isMine, loading }
}
