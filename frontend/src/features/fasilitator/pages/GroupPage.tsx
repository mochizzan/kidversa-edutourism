import { useState, useEffect, useCallback, useMemo, type ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Users, /* Monitor, */ User, ArrowRight, CheckCircle2 } from 'lucide-react'
import { sessionService } from '../../../core/services/sessions'
import { SessionStatus } from '../../../core/types/enums'
import { liveService, type GroupStageProgressRow } from '../../../core/services/live'
import { ROUTES } from '../../../core/constants/app'
// import { kioskAccessPath } from '../../../core/constants/app' // hidden: tombol Buka Kiosk
// import { apiRequest } from '../../../core/services/backend-client' // hidden: tombol Buka Kiosk
// import { API_ROUTES } from '../../../core/constants/apiRoutes' // hidden: tombol Buka Kiosk
import { parentStageId, substagesOfStage } from '../../../core/utils/substage'
import { assessmentService } from '../../../core/services/assessments'
import { attendanceService } from '../../../core/services/attendance'
import { programService } from '../../../core/services/programs'
import { useConfirmDialog } from '../../../shared/hooks/useConfirmDialog'
// NOTE: GroupPage intentionally does NOT call userService — GET /api/users is
// admin-only (RequireRole SUPER_ADMIN, ADMIN). The facilitator PIC name comes
// from the backend's `facilitator_name` field on each group (Opsi B).
import { useAuth } from '../../../core/hooks/useAuth'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { ChildListItem } from '../components/ChildListItem'
import { GroupCompleteButton } from '../components/GroupCompleteButton'
import { evaluateGroupCompletion, isTopicCompletedFromProgress } from '../utils/groupCompletion'
import { friendlyError } from '../../../core/utils/errorMessages'
import { groupCompletedErrorMessage } from '../utils/groupCompletedLock'
import type {
  Session,
  SessionStage,
  SessionGroup,
  Participant,
  Assessment,
  SessionSubstage,
} from '../../../core/types'

interface GroupDetail {
  group: SessionGroup
  participants: Participant[]
  session: Session
  /** All session stages of the session — one session stage = one topic. */
  stages: SessionStage[]
  /** Topic display names keyed by program_stage_id (from programService.getStages). */
  topicNameByProgramStageId: Map<string, string>
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
  const { t } = useTranslation()
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const { user } = useAuth()
  const { addToast } = useGlobalToast()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [sessionSubstages, setSessionSubstages] = useState<SessionSubstage[]>([])
  const [completing, setCompleting] = useState(false)
  // const [kioskLoading, setKioskLoading] = useState(false) // hidden: tombol Buka Kiosk
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean>>(new Map())
  const [attendanceLoading, setAttendanceLoading] = useState<Set<string>>(new Set())

  // ── Single source of truth for the ACTIVE TOPIC ──
  // One session stage = one topic. Initialized inside fetchData from the
  // historical resolution chain (group.current_session_stage_id →
  // progress-row fallback → ACTIVE stage → first stage) and afterwards only
  // by the topic dropdown (handleTopicChange). EVERYTHING topic-related on
  // this page derives from this id via `selectedSessionStage` below — the
  // topic name, activeLeaves, isAssessed/scored-pair checks, and the
  // evaluateGroupCompletion inputs. Do NOT introduce a second notion of the
  // active topic (there is deliberately no sessionStage/programStageName on
  // groupDetail anymore).
  const [selectedSessionStageId, setSelectedSessionStageId] = useState<string | null>(null)

  // Server progress rows for THIS group (group_stage_progress via
  // liveService.getGroupsWithProgress). Fetched on EVERY fetchData (not only
  // on the stage-resolution fallback) — the source of truth for the per-topic
  // completed state derived below, so a page refresh restores the disabled
  // Complete button from server data instead of local memory.
  const [groupProgressRows, setGroupProgressRows] = useState<GroupStageProgressRow[]>([])

  const fetchData = useCallback(async () => {
    if (!groupId) return
    try {
      setLoading(true)
      setError(null)

      // Find session containing this group
      const res = await sessionService.getAll({ limit: 100 })
      const detail = await findGroupInSessions(res.data, groupId)

      if (!detail) {
        setError(t('fasilitator.group.notFound'))
        return
      }

      // Get the matching group
      const group = detail.groups.find((g) => g.id === groupId)
      if (!group) {
        setError(t('fasilitator.group.notFound'))
        return
      }

      // Ownership guard: FASILITATOR may only access their own groups.
      const isGroupMine = !user || user.role !== 'FASILITATOR' || group.facilitator_id === user.id
      if (!isGroupMine) {
        navigate(ROUTES.FASILITATOR.DASHBOARD, { replace: true })
        addToast({ type: 'error', message: t('fasilitator.group.noAccess') })
        return
      }

      // Get program stages for stage name lookup
      const programStages = await programService.getStages(detail.program_id)
      const stageNameMap = new Map(programStages.map((ps) => [ps.id, ps.name]))

      // Load session-substages (Kegiatan leaves). No kiosk token hack — the new
      // endpoint replaces it.
      const sessionSubstagesData = await sessionService.getSubstages(detail.id)
      setSessionSubstages(sessionSubstagesData)

      // Progress rows for THIS group — fetched on EVERY load (previously only
      // on the stage-resolution fallback below) so the per-topic completed
      // state derives from server data and survives a page refresh. Non-fatal
      // on failure: the page degrades to "topic not completed" and the
      // server-side re-completion guard is the authoritative backstop.
      let progressRows: GroupStageProgressRow[] = []
      try {
        const groupsData = await liveService.getGroupsWithProgress(detail.id)
        progressRows = groupsData.find((g) => g.group.id === group.id)?.progress ?? []
      } catch (progressErr) {
        console.error('[GroupPage] group progress fetch failed', progressErr)
      }
      setGroupProgressRows(progressRows)

      // Find current session stage
      let currentStage = detail.stages.find((s) => s.id === group.current_session_stage_id)

      if (!currentStage && detail.stages.length > 0) {
        const latest = progressRows
          .filter((p) => p.status === 'COMPLETED' || p.status === 'IN_PROGRESS' || p.status === 'SKIPPED')
          .sort(
            (a, b) =>
              new Date(b.completed_at ?? b.entered_at ?? '').getTime() -
              new Date(a.completed_at ?? a.entered_at ?? '').getTime(),
          )[0]
        if (latest) {
          const parentId = parentStageId(sessionSubstagesData, latest.session_substage_id)
          if (parentId) {
            currentStage = detail.stages.find((s) => s.id === parentId)
          }
        }
      }

      if (!currentStage && detail.stages.length > 0) {
        currentStage =
          detail.stages.find((s) => s.status === 'ACTIVE') ?? detail.stages[0]
      }
      // Get assessments for this session
      const sessionAssessments = await assessmentService.getBySession(detail.id)
      setAssessments(sessionAssessments)

      // Fetch attendance for this session
      try {
        const attendanceRes = await attendanceService.getBySession(detail.id)
        const attMap = new Map<string, boolean>()
        for (const a of attendanceRes) {
          attMap.set(a.participant_id, a.is_present)
        }
        setAttendanceMap(attMap)
      } catch (error) {
        // Non-fatal: attendance defaults to not-present — log so the default
        // is traceable to a fetch failure, not real absence.
        console.error('[GroupPage] attendance fetch failed', error)
      }

      setGroupDetail({
        group,
        participants: group.participants,
        session: detail,
        stages: detail.stages,
        topicNameByProgramStageId: stageNameMap,
      })
      // Persist the resolved active topic into the single-source state. Runs
      // on every fetchData (mount, post-completion refresh, error retry) so a
      // refetch re-syncs with the server's current_session_stage_id instead of
      // keeping a stale selection.
      setSelectedSessionStageId(currentStage?.id ?? null)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [groupId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Pure derivation of selectedSessionStageId from the loaded session stages —
  // the ONLY bridge between the dropdown state and the rest of the page.
  const selectedSessionStage = useMemo<SessionStage | undefined>(
    () => groupDetail?.stages.find((s) => s.id === selectedSessionStageId),
    [groupDetail, selectedSessionStageId],
  )

  // Dropdown options: one option per topic (session stage), labelled with the
  // topic name resolved from the program stages lookup. `undefined` name falls
  // back to fasilitator.topicFallback at the render site.
  const topicOptions = useMemo(
    () =>
      groupDetail
        ? groupDetail.stages.map((s) => ({
          id: s.id,
          name: groupDetail.topicNameByProgramStageId.get(s.program_stage_id),
        }))
        : [],
    [groupDetail],
  )

  // Next-topic lookup for the continue mechanism: the entry IMMEDIATELY AFTER
  // the selected topic in groupDetail.stages — the same array topicOptions maps
  // into dropdown options, so dropdown order and "next" agree by construction
  // (no second topic list). undefined on the last topic or when nothing is
  // selected.
  const nextSessionStage = useMemo<SessionStage | undefined>(() => {
    if (!groupDetail || !selectedSessionStage) return undefined
    const index = groupDetail.stages.findIndex((s) => s.id === selectedSessionStage.id)
    return index === -1 ? undefined : groupDetail.stages[index + 1]
  }, [groupDetail, selectedSessionStage])

  // Displayed topic name — follows selectedSessionStage (the dropdown), never a
  // frozen copy on groupDetail.
  const programStageName = useMemo(
    () =>
      selectedSessionStage
        ? groupDetail?.topicNameByProgramStageId.get(selectedSessionStage.program_stage_id)
        : undefined,
    [groupDetail, selectedSessionStage],
  )

  // Kegiatan leaves (session_substages) of the active SubTopik.
  const activeLeaves = useMemo<SessionSubstage[]>(() => {
    if (!selectedSessionStage) return []
    return substagesOfStage(sessionSubstages, selectedSessionStage.id)
  }, [selectedSessionStage, sessionSubstages])

  // Per-topic completed state from SERVER progress rows (groupProgressRows,
  // fetched on every fetchData): the active topic is done when EVERY Kegiatan
  // leaf has a terminal (COMPLETED/SKIPPED) row — missing rows mean NOT
  // completed. A whole-group COMPLETED status also counts (terminal group ⇒
  // every topic done). Refresh-safe: derives from server data, never local
  // memory.
  const isTopicCompleted = useMemo(
    () =>
      groupDetail?.group.status === 'COMPLETED' ||
      isTopicCompletedFromProgress(groupProgressRows, activeLeaves),
    [groupDetail, groupProgressRows, activeLeaves],
  )

  // Scored (participant, substage) pairs: assessment with star_rating >= 1.
  // Built once so isAssessed stays O(1) per participant.
  const scoredPairs = useMemo(() => {
    const set = new Set<string>()
    for (const a of assessments) {
      if (a.star_rating >= 1) {
        set.add(`${a.participant_id}|${a.session_substage_id}`)
      }
    }
    return set
  }, [assessments])

  // Check if a participant is present for this session (explicit attendance
  // row only — unmarked participants are handled by evaluateGroupCompletion).
  const isPresent = useCallback((participantId: string): boolean => {
    return attendanceMap.get(participantId) ?? false
  }, [attendanceMap])

  // C7 all-or-nothing: a child counts as assessed for the active SubTopik only
  // when EVERY Kegiatan leaf has an assessment (star_rating >= 1) for them.
  // No presence gate here — completion presence semantics live in
  // evaluateGroupCompletion (only explicitly-present participants are required;
  // absent and unmarked participants never block).
  const isAssessed = (participantId: string): boolean => {
    if (!selectedSessionStage || activeLeaves.length === 0) return false
    return activeLeaves.every((leaf) =>
      scoredPairs.has(`${participantId}|${leaf.id}`),
    )
  }

  // Completion rule: every explicitly-present participant fully assessed.
  // Explicit absentees and unmarked participants (belum absen) do not block.
  const completion = evaluateGroupCompletion({
    participantIds: groupDetail ? groupDetail.participants.map((p) => p.id) : [],
    attendance: attendanceMap,
    isFullyAssessed: isAssessed,
  })

  const handleComplete = () => {
    if (!groupDetail) return
    if (!completion.canComplete) return
    confirm.requestConfirm(groupId!)
  }

  const confirmComplete = async () => {
    if (!groupDetail || !groupId || !selectedSessionStage) return
    if (activeLeaves.length === 0) {
      addToast({ type: 'error', message: t('fasilitator.group.noActivities') })
      return
    }
    setCompleting(true)
    try {
      // Complete EVERY Kegiatan leaf of the active SubTopik (C7) via the
      // group-scoped override (POST /api/live/groups/:groupId/stages/:id/complete).
      // This writes group_stage_progress rows per group — the source of truth
      // for group completion. The old code called the global
      // POST /api/session-substages/:id/complete which only flips the shared
      // session_substages row, so session_groups.status stayed WAITING forever
      // while the toast still showed success. Sequential so a mid-way failure
      // surfaces; each call posts a Kegiatan id only.
      for (const leaf of activeLeaves) {
        await liveService.completeStage(groupId, leaf.id)
      }
      await liveService.addTimelineEvent(
        groupDetail.session.id,
        groupId,
        'group:completed',
        `${groupDetail.group.name} menyelesaikan "${programStageName ?? 'Topik'}"`,
        user?.id,
      )
      confirm.dismiss()
      addToast({ type: 'success', message: t('fasilitator.group.completeSuccess') })
      // Stay on this page and refresh so the completed state renders; the old
      // code pushed to the dashboard which hid the (never-changing) status.
      await fetchData()
    } catch (err) {
      // Never swallow: surface the real failure — including the server's
      // explicit group_already_completed rejection — via friendlyError
      // (locale key → backend envelope message → generic fallback).
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setCompleting(false)
    }
  }

  const handleAssess = (participantId: string) => {
    if (groupDetail?.group.status === 'COMPLETED') {
      addToast({
        type: 'error',
        message: groupCompletedErrorMessage(),
      })
      return
    }
    navigate(`/fasilitator/groups/${groupId}/children/${participantId}`, {
      state: { sessionId: groupDetail?.session.id },
    })
  }

  // const handleOpenKiosk = async () => { // hidden: tombol Buka Kiosk
  //   if (!groupDetail || !groupDetail.session.id) return
  //   const sessionId = groupDetail.session.id
  //   const stageId = openableStageId ?? groupDetail.group.current_session_stage_id
  //   if (!stageId) {
  //     addToast({ type: 'error', message: t('fasilitator.group.noActiveStage') })
  //     return
  //   }
  //   // Edge case: kiosk token multi-use dan tidak pernah dikonsumsi (berlaku
  //   // sampai TTL-nya habis). Jika sesi belum ACTIVE, konten mungkin kosong —
  //   // beri peringatan, tapi tetap izinkan (backend tidak memblokir).
  //   if (groupDetail.session.status !== 'ACTIVE') {
  //     addToast({ type: 'info', message: t('fasilitator.group.sessionInactiveKiosk') })
  //   }
  //   setKioskLoading(true)
  //   // Buka jendela SEBELUM await agar tidak terblokir popup blocker
  //   // (browser hanya mengizinkan window.open dalam user-gesture sync).
  //   const kioskUrl = `${kioskAccessPath(sessionId, stageId, groupId)}?token=`
  //   const popup = window.open(kioskUrl, '_blank')
  //   try {
  //     const res = await apiRequest<{ data: { token: string } }>(
  //       'POST',
  //       API_ROUTES.AUTH.KIOSK,
  //       { session_id: sessionId },
  //     )
  //     const token = res.data.token
  //     const finalUrl = `${kioskAccessPath(sessionId, stageId, groupId)}?token=${encodeURIComponent(token)}`
  //     if (popup) {
  //       popup.location.href = finalUrl
  //       popup.focus()
  //     } else {
  //       // Popup diblokir: fallback buka lewat anchor (user-gesture sudah lewat).
  //       window.open(finalUrl, '_blank')
  //     }
  //   } catch (err) {
  //     addToast({ type: 'error', message: friendlyError(err) })
  //     popup?.close()
  //   } finally {
  //     setKioskLoading(false)
  //   }
  // }

  const handleToggleAttendance = useCallback(async (participantId: string) => {
    if (!groupDetail) return
    if (groupDetail.group.status === 'COMPLETED') {
      addToast({
        type: 'error',
        message: groupCompletedErrorMessage(),
      })
      return
    }
    const current = attendanceMap.get(participantId) ?? false
    const newValue = !current

    // Optimistic update
    setAttendanceMap(prev => new Map(prev).set(participantId, newValue))
    setAttendanceLoading(prev => new Set(prev).add(participantId))

    try {
      await attendanceService.upsert({
        participant_id: participantId,
        session_id: groupDetail.session.id,
        is_present: newValue,
      })
    } catch {
      // Revert on error
      setAttendanceMap(prev => new Map(prev).set(participantId, current))
      addToast({ type: 'error', message: t('fasilitator.group.attendanceError') })
    } finally {
      setAttendanceLoading(prev => {
        const next = new Set(prev)
        next.delete(participantId)
        return next
      })
    }
  }, [attendanceMap, groupDetail, addToast])

  // Topic dropdown: switching the active topic is a pure state change on
  // selectedSessionStageId. Assessments/attendance/substages are SESSION-scoped
  // and stay loaded, while every stage-keyed derivation (topic name,
  // activeLeaves, isAssessed, completion/lock) re-runs off that id — so a
  // selection change can never leave a stale topic's leaves/name/completion
  // visible, and there is no stage-scoped UI state to reset.
  const handleTopicChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedSessionStageId(e.target.value)
  }

  // Continue-to-next-topic control: advancing is a PURE selection change on
  // the SAME single-source state the dropdown writes above — no refetch and no
  // server write (session-scoped data is already loaded; every stage-keyed
  // derivation re-runs off the new id). Kept next to handleTopicChange so the
  // two selection pathways are visibly one mechanism.
  const handleContinueToNextTopic = () => {
    if (nextSessionStage) setSelectedSessionStageId(nextSessionStage.id)
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
        <PageHeader title={t('fasilitator.group.pageTitle')} breadcrumbs={[{ label: t('common.dashboard'), href: ROUTES.FASILITATOR.DASHBOARD }, { label: t('fasilitator.group.crumbError') }]} />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty state ──
  if (!groupDetail) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.group.pageTitle')} />
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={t('fasilitator.group.emptyTitle')}
          description={t('fasilitator.group.emptyDesc')}
        />
      </div>
    )
  }

  const { group, participants } = groupDetail
  // const openableStageId = selectedSessionStage?.id ?? groupDetail.group.current_session_stage_id // hidden: tombol Buka Kiosk
  // PIC name is resolved server-side (Opsi B) and sent on each group, so it is
  // safe for any role that can open this page — no admin-only call needed.
  const facilitatorName = group.facilitator_name

  // Opsi A: a FASILITATOR may act only on groups they own (group.facilitator_id).
  // ADMIN/KOORDINATOR/SUPER_ADMIN bypass (full access). Drives the read-only UI.
  const isMine =
    !user || user.role !== 'FASILITATOR' || group.facilitator_id === user.id

  const isSessionActive = groupDetail.session.status === SessionStatus.ACTIVE
  // Completion is terminal: once the group row is COMPLETED, attendance and
  // assessment stay locked (render gates below) and the Complete button stays
  // rendered but DISABLED (never hidden) — the disabled state also derives
  // per-topic from server progress rows via isTopicCompleted above.
  const isGroupCompleted = group.status === 'COMPLETED'

  return (
    <div className="space-y-6">
      <PageHeader
        title={group.name}
        subtitle={
          // >1 topic → topic selector in the subtitle slot (directly under the
          // group name); exactly 1 topic → the plain-text topic name as before.
          topicOptions.length > 1 ? (
            <select
              value={selectedSessionStage?.id ?? ''}
              onChange={handleTopicChange}
              aria-label={t('fasilitator.group.topicSelectLabel')}
              className="max-w-full px-3 py-1.5 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface"
            >
              {topicOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name ?? t('fasilitator.topicFallback')}
                </option>
              ))}
            </select>
          ) : (
            programStageName ?? t('fasilitator.topicFallback')
          )
        }
        breadcrumbs={[
          { label: t('common.dashboard'), href: ROUTES.FASILITATOR.DASHBOARD },
          { label: group.name },
        ]}
      // actions={ // hidden: tombol Buka Kiosk
      //   <Button
      //     variant="primary"
      //     size="sm"
      //     onClick={handleOpenKiosk}
      //     loading={kioskLoading}
      //     disabled={!openableStageId || !isMine}
      //     icon={<Monitor className="w-4 h-4" />}
      //     className="shrink-0 whitespace-nowrap"
      //   >
      //     {t('fasilitator.group.openKiosk')}
      //   </Button>
      // }
      />

      {!isSessionActive && (
        <div className="flex items-center gap-2 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
          {t('fasilitator.group.sessionNotStarted')}
        </div>
      )}

      {!isMine ? (
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          <User className="w-4 h-4 shrink-0" />
          {facilitatorName
            ? t('fasilitator.group.readOnlyPic', { name: facilitatorName })
            : t('fasilitator.group.readOnly')}
        </div>
      ) : (
        facilitatorName && (
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <User className="w-4 h-4 shrink-0" />
            {t('fasilitator.group.facilitatorLine', { name: facilitatorName })}
          </div>
        )
      )}

      {/* Participant list */}
      {participants.length === 0 ? (
        <EmptyState
          icon={<Users className="w-12 h-12" />}
          title={t('fasilitator.group.emptyTitle')}
          description={t('fasilitator.group.emptyDesc')}
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
              isPresent={isPresent(participant.id)}
              onToggleAttendance={isMine && !isGroupCompleted ? () => handleToggleAttendance(participant.id) : undefined}
              attendanceLoading={attendanceLoading.has(participant.id)}
              showPhoto={participant.consent_photo}
              onAssess={isMine && isSessionActive && !isGroupCompleted ? () => handleAssess(participant.id) : undefined}
              locked={isGroupCompleted}
            />
          ))}
        </div>
      )}

      {/* Group complete button — always rendered while the group has
          participants; DISABLED (not hidden) once the active topic is
          completed per server progress rows, the whole group is terminal,
          the grading gate is unmet, a completion is in flight, or the caller
          does not own the group. */}
      {participants.length > 0 && (
        <GroupCompleteButton
          canComplete={completion.canComplete}
          assessedCount={completion.assessedPresentCount}
          presentCount={completion.presentCount}
          remainingCount={completion.remainingCount}
          onComplete={handleComplete}
          loading={completing}
          disabled={
            isTopicCompleted ||
            isGroupCompleted ||
            !completion.canComplete ||
            completing ||
            !isMine
          }
        />
      )}

      {/* Topic completion status — the continue mechanism reads the SAME
          single-source state as everything above (isTopicCompleted + the
          selectedSessionStage-derived nextSessionStage) and writes through the
          SAME pathway as the topic dropdown (setSelectedSessionStageId), so
          dropdown and continue can never disagree. Pure client-side selection:
          no refetch, no server write.
          - active topic completed + next topic → "continue" control;
          - active topic completed + last topic, OR whole group COMPLETED →
            terminal indicator instead;
          - active topic not completed → neither renders. */}
      {isTopicCompleted &&
        (isGroupCompleted || !nextSessionStage ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 rounded-2xl bg-green-50 border border-green-200 px-4 py-3.5 text-sm font-medium text-green-700"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            {t('fasilitator.group.allTopicsDone')}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleContinueToNextTopic}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-base transition-all duration-200 min-h-[52px] bg-primary text-white hover:bg-primary-dark shadow-sm hover:shadow-md"
          >
            {t('fasilitator.group.continueToNextTopic', {
              name:
                groupDetail.topicNameByProgramStageId.get(nextSessionStage.program_stage_id) ??
                t('fasilitator.topicFallback'),
            })}
            <ArrowRight className="w-5 h-5" />
          </button>
        ))}

      {/* Confirmation Modal */}
      <Modal
        open={confirm.open}
        onClose={confirm.dismiss}
        title={t('fasilitator.group.completeModalTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={confirm.dismiss}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={confirmComplete} loading={completing}>
              {t('fasilitator.group.confirmComplete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          {t('fasilitator.group.completeConfirmMsg')}
        </p>
      </Modal>
    </div>
  )
}

export default GroupPage
