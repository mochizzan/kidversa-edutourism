import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Users, Target, Monitor } from 'lucide-react'
import { sessionService } from '../../../core/services/sessions'
import { liveService } from '../../../core/services/live'
import { ROUTES } from '../../../core/constants/app'
import { kioskAccessPath } from '../../../core/constants/app'
import { apiRequest } from '../../../core/services/backendClient'
import { API_ROUTES } from '../../../core/constants/apiRoutes'
import { assessmentService } from '../../../core/services/assessments'
import { programService } from '../../../core/services/programs'
import { useConfirmDialog } from '../../../shared/hooks/useConfirmDialog'
import { useAuth } from '../../../core/hooks/useAuth'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { ChildListItem } from '../components/ChildListItem'
import { GroupCompleteButton } from '../components/GroupCompleteButton'
import { friendlyError } from '../../../core/utils/errorMessages'
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
  const { user } = useAuth()
  const { addToast } = useGlobalToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [completing, setCompleting] = useState(false)
  const [kioskLoading, setKioskLoading] = useState(false)

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
      let currentStage = detail.stages.find((s) => s.id === group.current_session_stage_id)

      if (!currentStage && detail.stages.length > 0) {
        const groupsData = await liveService.getGroupsWithProgress(detail.id)
        const groupProg = groupsData.find((g) => g.group.id === group.id)
        const latest = groupProg?.progress
          ?.filter((p) => p.status === 'COMPLETED' || p.status === 'IN_PROGRESS' || p.status === 'SKIPPED')
          ?.sort(
            (a, b) =>
              new Date(b.completed_at ?? b.entered_at ?? '').getTime() -
              new Date(a.completed_at ?? a.entered_at ?? '').getTime(),
          )[0]
        if (latest) {
          currentStage = detail.stages.find((s) => s.id === latest.session_stage_id)
        }
      }

      if (!currentStage && detail.stages.length > 0) {
        currentStage =
          detail.stages.find((s) => s.status === 'ACTIVE') ?? detail.stages[0]
      }
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
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const isAssessed = (participantId: string): boolean => {
    if (!groupDetail?.sessionStage) return false
    return assessments.some(
      (a) =>
        a.participant_id === participantId &&
        a.session_stage_id === groupDetail.sessionStage!.id,
    )
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
      await liveService.completeStage(groupId, groupDetail.sessionStage.id)
      await liveService.addTimelineEvent(
        groupDetail.session.id,
        groupId,
        'group:completed',
        `${group.name} menyelesaikan "${groupDetail.programStageName ?? 'Stage'}"`,
        user?.id,
      )
      confirm.dismiss()
      addToast({ type: 'success', message: 'Kelompok berhasil diselesaikan' })
      navigate(ROUTES.FASILITATOR.DASHBOARD)
    } catch {
      addToast({ type: 'error', message: 'Gagal menyelesaikan kelompok' })
    } finally {
      setCompleting(false)
    }
  }

  const handleAssess = (participantId: string) => {
    navigate(`/fasilitator/groups/${groupId}/children/${participantId}`)
  }

  const handleOpenKiosk = async () => {
    if (!groupDetail || !groupDetail.session.id) return
    const sessionId = groupDetail.session.id
    const stageId = groupDetail.group.current_session_stage_id
    if (!stageId) {
      addToast({ type: 'error', message: 'Kelompok belum memiliki stage aktif untuk dibuka di kiosk.' })
      return
    }
    // Edge case: kiosk token single-use. Jika sesi belum ACTIVE, konten mungkin
    // kosong — beri peringatan, tapi tetap izinkan (backend tidak memblokir).
    if (groupDetail.session.status !== 'ACTIVE') {
      addToast({ type: 'info', message: 'Sesi belum aktif — kiosk mungkin menampilkan konten kosong.' })
    }
    setKioskLoading(true)
    // Buka jendela SEBELUM await agar tidak terblokir popup blocker
    // (browser hanya mengizinkan window.open dalam user-gesture sync).
    const kioskUrl = `${kioskAccessPath(sessionId, stageId)}?token=`
    const popup = window.open(kioskUrl, '_blank')
    try {
      const res = await apiRequest<{ data: { token: string } }>(
        'POST',
        API_ROUTES.AUTH.KIOSK,
        { session_id: sessionId },
      )
      const token = res.data.token
      const finalUrl = `${kioskAccessPath(sessionId, stageId)}?token=${encodeURIComponent(token)}`
      if (popup) {
        popup.location.href = finalUrl
        popup.focus()
      } else {
        // Popup diblokir: fallback buka lewat anchor (user-gesture sudah lewat).
        window.open(finalUrl, '_blank')
      }
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
      popup?.close()
    } finally {
      setKioskLoading(false)
    }
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
          <PageHeader title="Kelompok" breadcrumbs={[{ label: 'Dashboard', href: ROUTES.FASILITATOR.DASHBOARD }, { label: 'Error' }]} />
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
          { label: 'Dashboard', href: ROUTES.FASILITATOR.DASHBOARD },
          { label: group.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Target className="w-4 h-4" />
              <span>{programStageName ?? 'Stage'}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenKiosk}
              loading={kioskLoading}
              disabled={!groupDetail?.group.current_session_stage_id}
              icon={<Monitor className="w-4 h-4" />}
            >
              Buka Kiosk
            </Button>
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

      {/* Open kiosk (public display) */}
      <div className="flex justify-center pt-2">
        <Button
          variant="secondary"
          onClick={handleOpenKiosk}
          loading={kioskLoading}
          disabled={!groupDetail?.group.current_session_stage_id}
          icon={<Monitor className="w-4 h-4" />}
        >
          Buka Kiosk (Tampilan Peserta)
        </Button>
      </div>

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
