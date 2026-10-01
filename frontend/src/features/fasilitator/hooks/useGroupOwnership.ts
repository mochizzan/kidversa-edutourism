import { useState, useEffect } from 'react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import type { Session, SessionGroup } from '../../../core/types'

// Opsi A: a FASILITATOR may act only on groups they own (group.facilitator_id).
// ADMIN/KOORDINATOR/SUPER_ADMIN bypass the ownership gate. The backend enforces
// this too; this hook only drives the read-only UI on child/photo/recording pages.
export function useGroupOwnership(childId: string | undefined) {
  const { user } = useAuth()
  const [group, setGroup] = useState<SessionGroup | undefined>(undefined)
  // Session detail of the participant's session — the same getById fetch the
  // group lookup already performs, captured so consumers (e.g. frame
  // ownership filtering via program_id) don't have to refetch it.
  const [session, setSession] = useState<Session | null>(null)
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
          if (!cancelled) {
            setGroup(undefined)
            setSession(null)
          }
          return
        }
        const detail = await sessionService.getById(part.session_id)
        if (cancelled) return
        setSession(detail ?? null)
        setGroup(detail?.groups.find((g) => g.id === part.group_id))
      })
      .catch((error) => {
        // Fail closed (no group → read-only) but never silently: log the fetch
        // failure that forced the ownership lookup down.
        console.error('[useGroupOwnership] ownership lookup failed', error)
        if (!cancelled) {
          setGroup(undefined)
          setSession(null)
        }
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

  return { group, session, isMine, loading }
}
