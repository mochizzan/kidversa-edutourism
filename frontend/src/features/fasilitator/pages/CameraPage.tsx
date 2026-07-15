import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Users, ChevronRight, Calendar } from 'lucide-react'
import { useAuth } from '../../../core/hooks/useAuth'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { SessionStatus } from '../../../core/types/enums'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Card } from '../../../shared/components/ui/Card'
import { Badge } from '../../../shared/components/ui/Badge'
import type { Participant } from '../../../core/types'
import { friendlyError } from '../../../core/utils/errorMessages'

interface GroupWithParticipants {
  groupId: string
  groupName: string
  participants: Participant[]
}

const CameraPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupWithParticipants[]>([])
  const [sessionName, setSessionName] = useState('')

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await sessionService.getAll({ limit: 100 })
      const activeSessions = res.data.filter((s) => s.status === SessionStatus.ACTIVE)

      if (activeSessions.length === 0) {
        setGroups([])
        setSessionName('')
        return
      }

      // Use the first active session
      const session = activeSessions[0]
      setSessionName(session.name)

      const detail = await sessionService.getById(session.id)
      if (!detail) {
        setGroups([])
        return
      }

      const groupsWithProgress = await liveService.getGroupsWithProgress(session.id)

      const result: GroupWithParticipants[] = groupsWithProgress
        .filter((g) => g.group.status !== 'COMPLETED')
        .map((g) => ({
          groupId: g.group.id,
          groupName: g.group.name,
          participants: g.participants,
        }))

      setGroups(result)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ambil Foto" />
        <div className="animate-pulse space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl p-5 h-24" />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ambil Foto" />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty ──
  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ambil Foto" />
        <EmptyState
          icon={<Camera className="w-12 h-12" />}
          title="Belum ada peserta"
          description="Tidak ada kelompok aktif dengan peserta untuk difoto."
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ambil Foto" />

      {sessionName && (
        <div className="flex items-center gap-2 text-sm text-on-surface-variant">
          <Calendar className="w-4 h-4" />
          <span>{sessionName}</span>
        </div>
      )}

      {groups.map((group) => (
        <Card key={group.groupId} title={group.groupName} padding="sm">
          <div className="space-y-2">
            {group.participants.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  navigate(`/fasilitator/groups/${group.groupId}/children/${p.id}/photo`)
                }
                className="w-full flex items-center justify-between py-3 px-0 rounded-xl hover:bg-surface-container-low transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-on-primary-container" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">
                      {p.child_name}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {p.school_name} &middot; {p.child_age} thn
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!p.consent_photo && (
                    <Badge variant="warning" size="sm">Tidak ada izin</Badge>
                  )}
                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

export default CameraPage
