import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Users, Target } from 'lucide-react'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { useConfirmDialog } from '../../../shared/hooks/useConfirmDialog'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { ChildListItem } from '../components/ChildListItem'
import { GroupCompleteButton } from '../components/GroupCompleteButton'
import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  Assessment,
} from '../../../core/types'

interface GroupDetail {
  group: SessionGroup
  participants: Participant[]
  programStageName?: string
  session: Session
  sessionStage: SessionStage | undefined
  isPhotoStage: boolean
  isRecordingStage: boolean
}

function findGroupInSessions(
  sessions: Session[],
  groupId: string,
): Promise<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null> {
  return sessions.reduce(async (prevPromise, session) => {
    const prev = await prevPromise
    if (prev) return prev
    const detail = await sessionService.getById(session.id)
    if (detail?.groups.some((g) => g.id === groupId)) {
      return detail
    }
    return null
  }, Promise.resolve(null) as Promise<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null>)
}

function SkeletonList() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-surface rounded-2xl p-4 shadow-sm border border-outline-variant/50 animate-pulse flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-full bg-surface-container-high shrink-0" />
          <div className="flex-1">
            <div className="h-4 bg-surface-container-high rounded w-1/3 mb-2" />
            <div className="h-3 bg-surface-container-high rounded w-1/4" />
          </div>
          <div className="h-8 bg-surface-container-high rounded w-16" />
        </div>
      ))}
    </div>
  )
}

const GroupPage = () => {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [completing, setCompleting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!groupId) return
    try {
      setLoading(true)
      setError(null)

      // Find session containing this group
      const res = await sessionService.getAll({ limit: 100 })
      const detail = await findGroupInSessions(res.data, groupId)

      if (!detail) {
        setError('Kelompok tidak ditemukan')
        return
      }

      // Get the matching group
      const group = detail.groups.find((g) => g.id === groupId)
      if (!group) {
        setError('Kelompok tidak ditemukan')
        return
      }

      // Get program stages for stage name lookup
      const programStages = await programService.getStages(detail.program_id)
      const stageNameMap = new Map(programStages.map((ps) => [ps.id, ps.name]))

      // Find current session stage
      const currentStage = detail.stages.find((s) => s.id === group.current_stage_id)
      const programStage = currentStage
        ? programStages.find((ps) => ps.id === currentStage.program_stage_id)
        : undefined

      // Get assessments for this session
      const sessionAssessments = await assessmentService.getBySession(detail.id)
      setAssessments(sessionAssessments)

      setGroupDetail({
        group,
        participants: group.participants,
        programStageName: currentStage
          ? stageNameMap.get(currentStage.program_stage_id)
          : undefined,
        session: detail,
        sessionStage: currentStage,
        isPhotoStage: programStage?.is_photo_stage ?? false,
        isRecordingStage: programStage?.is_recording_stage ?? false,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data kelompok')
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const isAssessed = (participantId: string): boolean => {
    return assessments.some((a) => a.participant_id === participantId)
  }

  const assessedCount = groupDetail
    ? groupDetail.participants.filter((p) => isAssessed(p.id)).length
    : 0

  const handleComplete = () => {
    if (!groupDetail) return
    if (assessedCount < groupDetail.participants.length) return
    confirm.requestConfirm(groupId!)
  }

  const confirmComplete = async () => {
    if (!groupDetail || !groupId || !groupDetail.sessionStage) return
    setCompleting(true)
    try {
      // Simulate completing the group's current stage
      // In a real app, this would call a service to advance the group
      await new Promise((r) => setTimeout(r, 500))
      confirm.dismiss()
      navigate('/fasilitator/dashboard')
    } catch {
      // Error handling
    } finally {
      setCompleting(false)
    }
  }

  const handleAssess = (participantId: string) => {
    navigate(`/fasilitator/groups/${groupId}/children/${participantId}`)
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-container-high rounded w-48 animate-pulse mb-4" />
        <div className="h-4 bg-surface-container-high rounded w-32 animate-pulse mb-2" />
        <SkeletonList />
      </div>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kelompok" breadcrumbs={[{ label: 'Dashboard', href: '/fasilitator/dashboard' }, { label: 'Error' }]} />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty state ──
  if (!groupDetail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kelompok" />
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="Belum ada peserta"
          description="Belum ada peserta yang terdaftar di kelompok ini."
        />
      </div>
    )
  }

  const { group, participants, programStageName, isPhotoStage, isRecordingStage } = groupDetail

  return (
    <div className="space-y-6">
      <PageHeader
        title={group.name}
        subtitle={programStageName ?? 'Stage'}
        breadcrumbs={[
          { label: 'Dashboard', href: '/fasilitator/dashboard' },
          { label: group.name },
        ]}
        actions={
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Target className="w-4 h-4" />
            <span>{programStageName ?? 'Stage'}</span>
          </div>
        }
      />

      {/* Participant list */}
      {participants.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title="Belum ada peserta"
          description="Belum ada peserta yang terdaftar di kelompok ini."
        />
      ) : (
        <div className="space-y-4">
          {participants.map((participant) => (
            <ChildListItem
              key={participant.id}
              name={participant.child_name}
              age={participant.child_age}
              school={participant.school_name}
              isAssessed={isAssessed(participant.id)}
              showPhoto={isPhotoStage}
              showRecording={isRecordingStage}
              onAssess={() => handleAssess(participant.id)}
            />
          ))}
        </div>
      )}

      {/* Group complete button */}
      {participants.length > 0 && (
        <GroupCompleteButton
          totalChildren={participants.length}
          assessedCount={assessedCount}
          onComplete={handleComplete}
          loading={completing}
        />
      )}

      {/* Confirmation Modal */}
      <Modal
        open={confirm.open}
        onClose={confirm.dismiss}
        title="Selesaikan Kelompok"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={confirm.dismiss}>
              Batal
            </Button>
            <Button variant="primary" onClick={confirmComplete} loading={completing}>
              Ya, Selesaikan
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin menyelesaikan kelompok ini? Semua penilaian akan disimpan dan
          kelompok akan melanjutkan ke stage berikutnya.
        </p>
      </Modal>
    </div>
  )
}

export default GroupPage
