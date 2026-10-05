import { useState, useEffect, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
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
  ParticipantAttendance,
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

// Per-topic attendance key: `${sessionStageId}:${participantId}` — kehadiran
// dicatat per (peserta, topik), bukan per sesi. Toggle topik B tidak
// menyentuh topik A (kontrak: session_stage_id kanonis = session_stages.id).
const attendanceKey = (sessionStageId: string, participantId: string) =>
  `${sessionStageId}:${participantId}`

// Merge server rows into the per-topic map. Explicit per-topic rows always
// win; legacy rows with missing/empty session_stage_id (pre-migration,
// NOT NULL DEFAULT '' per backend 000007, no backfill) fill only topics
// that have no explicit row yet (fill-if-absent), so old data still reads
// session-wide until re-marked per topic. A topic with no row at all stays
// UNMARKED (toggle defaults to not-present; completion exempts unmarked —
// existing convention, no new rule).
function mergeAttendanceRows(rows: ParticipantAttendance[], stageIds: string[]): Map<string, boolean> {
  const map = new Map<string, boolean>()
  const legacy: ParticipantAttendance[] = []
  for (const a of rows) {
    if (a.session_stage_id) map.set(attendanceKey(a.session_stage_id, a.participant_id), a.is_present)
    else legacy.push(a)
  }
  for (const a of legacy) {
    for (const stageId of stageIds) {
      const k = attendanceKey(stageId, a.participant_id)
      if (!map.has(k)) map.set(k, a.is_present)
    }
  }
  return map
}

const GroupPage = () => {
  const { t } = useTranslation()
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const confirm = useConfirmDialog()
  const { user } = useAuth()
  const { addToast } = useGlobalToast()
  // Mirror of the active topic in the URL query (`?stage=<sessionStageId>`).
  // Written on every selection change (dropdown + continue control) with
  // `replace: true` so the child assessment back-nav can restore the SAME
  // topic without growing history. Read once via preferredStageRef above.
  const syncStageQuery = useCallback(
    (stageId: string | null) => {
      const next = new URLSearchParams(searchParams)
      if (stageId) next.set('stage', stageId)
      else next.delete('stage')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [sessionSubstages, setSessionSubstages] = useState<SessionSubstage[]>([])
  const [completing, setCompleting] = useState(false)
  // const [kioskLoading, setKioskLoading] = useState(false) // hidden: tombol Buka Kiosk
  // Per-topic attendance: key `${sessionStageId}:${participantId}` —
  // kehadiran dicatat per (peserta, topik), bukan per sesi. Toggle topik B
  // tidak menyentuh topik A (kontrak: session_stage_id kanonis).
  const [attendanceMap, setAttendanceMap] = useState<Map<string, boolean>>(new Map())
  const [attendanceLoading, setAttendanceLoading] = useState<Set<string>>(new Set())
  // Topic id currently (re)fetching its attendance rows — drives the
  // per-topic loading hint on topic switch (null when idle).
  const [attendanceTopicLoading, setAttendanceTopicLoading] = useState<string | null>(null)
  // Monotonic id guarding per-topic refetches: a slow earlier topic fetch must
  // never overwrite a newer topic's rows after rapid dropdown switches.
  const attendanceFetchRef = useRef(0)

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
  //
  // Perbaikan-1: the child assessment page returns via
  // `/fasilitator/groups/:groupId?stage=<sessionStageId>` (query) + location
  // state `{ sessionStageId }`. `preferredStageRef` carries that hint across
  // the async fetchData below so a back-nav restores the SAME topic instead
  // of re-resolving to current_session_stage_id (the topik-1/topik-2 bug).
  const [selectedSessionStageId, setSelectedSessionStageId] = useState<string | null>(null)
  const preferredStageRef = useRef<string | null>(null)
  if (preferredStageRef.current === null) {
    const fromState = (location.state as { sessionStageId?: string } | null)?.sessionStageId
    const fromQuery = searchParams.get('stage')
    preferredStageRef.current = fromState ?? fromQuery ?? ''
  }
  // First-fetchData flag: the back-nav stage hint above applies ONLY on the
  // initial load. Post-completion refetches re-sync with the server (existing
  // behaviour) instead of sticking to a stale hint.
  const didInitStageRef = useRef(false)

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

      // Fetch attendance for this session (per-topic rows). One list call
      // returns every topic's rows; mergeAttendanceRows keys them per
      // (topic, participant). Legacy rows without session_stage_id fill
      // topics lacking an explicit row (fill-if-absent).
      try {
        const attendanceRes = await attendanceService.getBySession(detail.id)
        setAttendanceMap(mergeAttendanceRows(attendanceRes, detail.stages.map((s) => s.id)))
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
      //
      // Perbaikan-1: on the FIRST fetchData only, a back-nav hint from the
      // child assessment page (`?stage=<sessionStageId>` query and/or
      // location.state.sessionStageId, written by handleAssess below) wins over
      // the server chain above — otherwise returning from a topik-2 child
      // always snaps back to topik-1 (current_session_stage_id). Unknown ids
      // fall back loudly (warn) to the resolved stage, never to empty.
      if (!didInitStageRef.current) {
        didInitStageRef.current = true
        const preferred = preferredStageRef.current
        if (preferred) {
          const match = detail.stages.find((s) => s.id === preferred)
          if (match) {
            currentStage = match
          } else {
            console.warn('[GroupPage] unknown stage hint; using resolved stage', preferred)
          }
        }
      }
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

  // Perbaikan-1 per-topic lock: the ACTIVE topic is locked when the whole
  // group is terminal OR its every Kegiatan leaf has a terminal
  // (COMPLETED/SKIPPED) progress row. Locked controls stay VISIBLE but
  // disabled (read-only) and guarded writes toast via
  // groupCompletedErrorMessage() — forms are never hidden.
  const isTopicLocked = useMemo(
    () => (groupDetail?.group.status ?? '') === 'COMPLETED' || isTopicCompleted,
    [groupDetail, isTopicCompleted],
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

  // Check if a participant is present for the ACTIVE topic (explicit
  // per-topic row only — unmarked participants are handled by
  // evaluateGroupCompletion).
  const isPresent = useCallback((participantId: string): boolean => {
    if (!selectedSessionStageId) return false
    return attendanceMap.get(attendanceKey(selectedSessionStageId, participantId)) ?? false
  }, [attendanceMap, selectedSessionStageId])

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

  // Completion rule for the ACTIVE topic: every explicitly-present (in this
  // topic) participant fully assessed. Explicit absentees and unmarked
  // participants (belum absen) do not block. The per-topic slice is derived
  // from the composite map by stripping the active topic prefix.
  const activeTopicAttendance = useMemo(() => {
    if (!selectedSessionStageId) return new Map<string, boolean>()
    const slice = new Map<string, boolean>()
    const prefix = `${selectedSessionStageId}:`
    for (const [k, v] of attendanceMap) {
      if (k.startsWith(prefix)) slice.set(k.slice(prefix.length), v)
    }
    return slice
  }, [attendanceMap, selectedSessionStageId])

  const completion = evaluateGroupCompletion({
    participantIds: groupDetail ? groupDetail.participants.map((p) => p.id) : [],
    attendance: activeTopicAttendance,
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
    // Perbaikan-1: lock BOTH on whole-group COMPLETED and on per-topic
    // completion (isTopicLocked from server progress rows). Guard toast reuses
    // the canonical message; the list below keeps both controls visible but
    // disabled (never hidden).
    if (!groupDetail || groupDetail.group.status === 'COMPLETED' || isTopicLocked) {
      addToast({
        type: 'error',
        message: groupCompletedErrorMessage(),
      })
      return
    }
    // Perbaikan-1: forward the ACTIVE topic to the child assessment page via
    // BOTH the query string (`?stage=<sessionStageId>`) and location state.
    // The child resolves its leaves/scores from that stage (never from
    // current_session_stage_id) and echoes it back on Back so the group page
    // restores the same topic (topik-1/topik-2 bug fix).
    const stageId = selectedSessionStage?.id
    const target = stageId
      ? `/fasilitator/groups/${groupId}/children/${participantId}?stage=${encodeURIComponent(stageId)}`
      : `/fasilitator/groups/${groupId}/children/${participantId}`
    navigate(target, {
      state: { sessionId: groupDetail?.session.id, sessionStageId: stageId },
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
    if (!groupDetail || !selectedSessionStageId) return
    // Per-topic lock: whole-group COMPLETED or the active topic completed
    // per server progress rows. Guard toast reuses the canonical
    // group-completed message; the form stays visible but disabled.
    if (groupDetail.group.status === 'COMPLETED' || isTopicLocked) {
      addToast({
        type: 'error',
        message: groupCompletedErrorMessage(),
      })
      return
    }
    const topicId = selectedSessionStageId
    const key = attendanceKey(topicId, participantId)
    const current = attendanceMap.get(key) ?? false
    const newValue = !current

    // Optimistic update (per-topic key — other topics untouched)
    setAttendanceMap(prev => new Map(prev).set(key, newValue))
    setAttendanceLoading(prev => new Set(prev).add(key))

    try {
      await attendanceService.upsert({
        participant_id: participantId,
        session_id: groupDetail.session.id,
        session_stage_id: topicId,
        is_present: newValue,
      })
    } catch {
      // Revert on error
      setAttendanceMap(prev => new Map(prev).set(key, current))
      addToast({ type: 'error', message: t('fasilitator.group.attendanceError') })
    } finally {
      setAttendanceLoading(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [attendanceMap, groupDetail, selectedSessionStageId, addToast, isTopicLocked, t])

  // Refetch attendance rows for one topic and merge them additively into the
  // per-topic map (other topics' rows are kept, never cleared). Shows a
  // per-topic loading hint while in flight. A topic with no rows on the
  // server stays UNMARKED (toggle defaults to not-present; completion
  // exempts unmarked — existing convention, no new rule). Stale guard via
  // attendanceFetchRef: rapid dropdown switches resolve in order.
  const refetchTopicAttendance = useCallback(async (sessionId: string, stageId: string) => {
    const svc = attendanceService as { getByTopic?: (s: string, t: string) => Promise<ParticipantAttendance[]> }
    if (!svc.getByTopic) return
    const fetchId = ++attendanceFetchRef.current
    setAttendanceTopicLoading(stageId)
    try {
      const rows = (await svc.getByTopic(sessionId, stageId)) ?? []
      if (attendanceFetchRef.current !== fetchId) return
      setAttendanceMap((prev) => {
        const next = new Map(prev)
        for (const a of rows) {
          const topic = a.session_stage_id ?? stageId
          next.set(attendanceKey(topic, a.participant_id), a.is_present)
        }
        return next
      })
    } catch (error) {
      console.error('[GroupPage] topic attendance refetch failed', error)
    } finally {
      if (attendanceFetchRef.current === fetchId) setAttendanceTopicLoading(null)
    }
  }, [])

  // Topic dropdown: switching the active topic updates selectedSessionStageId
  // AND refetches that topic's attendance rows into the per-topic map
  // (additive merge — other topics' rows are kept, never reused raw). Every
  // stage-keyed derivation (topic name, activeLeaves, isAssessed,
  // completion/lock) re-runs off the new id.
  const handleTopicChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value
    setSelectedSessionStageId(nextId)
    syncStageQuery(nextId)
    if (groupDetail) void refetchTopicAttendance(groupDetail.session.id, nextId)
  }

  // Continue-to-next-topic control: advancing writes the SAME single-source
  // state the dropdown writes above, plus the same per-topic attendance
  // refetch — the two selection pathways stay one mechanism.
  const handleContinueToNextTopic = () => {
    if (nextSessionStage) {
      setSelectedSessionStageId(nextSessionStage.id)
      syncStageQuery(nextSessionStage.id)
      if (groupDetail) void refetchTopicAttendance(groupDetail.session.id, nextSessionStage.id)
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
  // (isTopicLocked is derived next to isTopicCompleted; both feed the gates
  // below.)
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
          {groupDetail.session.status === SessionStatus.CANCELLED
            ? t('fasilitator.group.sessionCancelled')
            : t('fasilitator.group.sessionNotStarted')}
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

      {/* Participant list. Attendance is PER-TOPIC: one toggle per
          participant for the ACTIVE topic, keyed by session_stage_id. A
          topic with no rows stays unmarked (defaults to not-present;
          unmarked never blocks completion). */}
      {participants.length > 0 && attendanceTopicLoading === selectedSessionStageId && (
        <p className="text-xs text-on-surface-variant" role="status">
          Memuat kehadiran topik…
        </p>
      )}
      {participants.length > 0 && (
        <p className="text-xs text-on-surface-variant">
          Kehadiran dicatat per topik dan hanya berlaku untuk topik aktif.
        </p>
      )}
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
              onToggleAttendance={isMine && isSessionActive && !isTopicLocked ? () => handleToggleAttendance(participant.id) : undefined}
              attendanceLoading={selectedSessionStageId ? attendanceLoading.has(`${selectedSessionStageId}:${participant.id}`) : false}
              showPhoto={participant.consent_photo}
              onAssess={isMine && isSessionActive && !isTopicLocked ? () => handleAssess(participant.id) : undefined}
              locked={isTopicLocked}
              sessionInactive={isMine && !isSessionActive}
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
