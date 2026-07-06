import { GroupStageProgressStatus } from '../../types'
import { mockStorage } from './db'
import { seedSessionStages, seedSessionGroups, seedParticipants } from './data/seed'

const PROGRESS_KEY = 'group_stage_progress_v1'
const TIMELINE_KEY = 'timeline_events_v1'

export interface GroupStageProgressRow {
  id: string
  group_id: string
  session_stage_id: string
  status: GroupStageProgressStatus
  entered_at?: string
  completed_at?: string
  unlocked_by?: string
  unlock_reason?: string
}

export interface TimelineEventRow {
  id: string
  session_id: string
  group_id: string
  type: 'group:progress' | 'group:completed' | 'stage:unlock' | 'override'
  message: string
  user_id?: string
  created_at: string
}

const seedProgress = (): GroupStageProgressRow[] => [
  // Kelompok Merah (g-1) — currently at Stage ss-2 (Jejak Sapi)
  {
    id: 'gsp-1',
    group_id: 'g-1',
    session_stage_id: 'ss-1',
    status: GroupStageProgressStatus.COMPLETED,
    entered_at: '2026-07-05T07:30:00.000Z',
    completed_at: '2026-07-05T07:45:00.000Z',
  },
  {
    id: 'gsp-2',
    group_id: 'g-1',
    session_stage_id: 'ss-2',
    status: GroupStageProgressStatus.IN_PROGRESS,
    entered_at: '2026-07-05T08:00:00.000Z',
  },
  {
    id: 'gsp-3',
    group_id: 'g-1',
    session_stage_id: 'ss-3',
    status: GroupStageProgressStatus.LOCKED,
  },
  // Kelompok Biru (g-2) — currently at Stage ss-1 (Sapa Profesi)
  {
    id: 'gsp-4',
    group_id: 'g-2',
    session_stage_id: 'ss-1',
    status: GroupStageProgressStatus.IN_PROGRESS,
    entered_at: '2026-07-05T08:05:00.000Z',
  },
  {
    id: 'gsp-5',
    group_id: 'g-2',
    session_stage_id: 'ss-2',
    status: GroupStageProgressStatus.LOCKED,
  },
  {
    id: 'gsp-6',
    group_id: 'g-2',
    session_stage_id: 'ss-3',
    status: GroupStageProgressStatus.LOCKED,
  },
  // Kelompok A (g-3) — completed session
  {
    id: 'gsp-7',
    group_id: 'g-3',
    session_stage_id: 'ss-4',
    status: GroupStageProgressStatus.COMPLETED,
    entered_at: '2026-06-20T07:00:00.000Z',
    completed_at: '2026-06-20T07:30:00.000Z',
  },
]

const initProgress = (): GroupStageProgressRow[] => {
  const existing = mockStorage.get<GroupStageProgressRow[]>(PROGRESS_KEY, [])
  if (existing.length) return existing
  const data = seedProgress()
  mockStorage.set(PROGRESS_KEY, data)
  return data
}

const seedTimeline = (): TimelineEventRow[] => [
  {
    id: 'tl-1',
    session_id: 's-1',
    group_id: 'g-1',
    type: 'group:progress',
    message: 'Kelompok Merah mulai Sapa Profesi',
    created_at: '2026-07-05T07:30:00.000Z',
  },
  {
    id: 'tl-2',
    session_id: 's-1',
    group_id: 'g-1',
    type: 'group:completed',
    message: 'Kelompok Merah selesai Sapa Profesi',
    user_id: 'u-3',
    created_at: '2026-07-05T07:45:00.000Z',
  },
  {
    id: 'tl-3',
    session_id: 's-1',
    group_id: 'g-1',
    type: 'stage:unlock',
    message: 'Koordinator konfirmasi pindah ke Jejak Sapi',
    user_id: 'u-2',
    created_at: '2026-07-05T07:48:00.000Z',
  },
  {
    id: 'tl-4',
    session_id: 's-1',
    group_id: 'g-1',
    type: 'group:progress',
    message: 'Kelompok Merah mulai Jejak Sapi',
    created_at: '2026-07-05T08:00:00.000Z',
  },
  {
    id: 'tl-5',
    session_id: 's-1',
    group_id: 'g-2',
    type: 'group:progress',
    message: 'Kelompok Biru mulai Sapa Profesi',
    created_at: '2026-07-05T08:05:00.000Z',
  },
]

const initTimeline = (): TimelineEventRow[] => {
  const existing = mockStorage.get<TimelineEventRow[]>(TIMELINE_KEY, [])
  if (existing.length) return existing
  mockStorage.set(TIMELINE_KEY, seedTimeline())
  return seedTimeline()
}

// ── Live Session Service ──

export interface LiveGroupWithProgress {
  group: typeof seedSessionGroups[0]
  progress: GroupStageProgressRow[]
  participants: typeof seedParticipants
}

export const mockLiveService = {
  getProgress: async (sessionId: string): Promise<GroupStageProgressRow[]> => {
    await new Promise((r) => setTimeout(r, 100))
    const stages = seedSessionStages.filter((s) => s.session_id === sessionId)
    const stageIds = stages.map((s) => s.id)
    return initProgress().filter((p) => stageIds.includes(p.session_stage_id))
  },

  getGroupsWithProgress: async (sessionId: string): Promise<LiveGroupWithProgress[]> => {
    await new Promise((r) => setTimeout(r, 150))
    const groups = seedSessionGroups.filter((g) => g.session_id === sessionId)
    const progress = initProgress()
    return groups.map((group) => ({
      group,
      progress: progress.filter((p) => p.group_id === group.id),
      participants: seedParticipants.filter((p) => p.group_id === group.id),
    }))
  },

  getTimeline: async (sessionId: string): Promise<TimelineEventRow[]> => {
    await new Promise((r) => setTimeout(r, 100))
    return initTimeline()
      .filter((t) => t.session_id === sessionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  unlockStage: async (groupId: string, sessionStageId: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = initProgress()
    const progress = all.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress && progress.status === GroupStageProgressStatus.LOCKED) {
      progress.status = GroupStageProgressStatus.UNLOCKED
      progress.unlocked_by = userId
      mockStorage.set(PROGRESS_KEY, all)
    }
  },

  completeStage: async (groupId: string, sessionStageId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = initProgress()
    const progress = all.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress && progress.status === GroupStageProgressStatus.IN_PROGRESS) {
      progress.status = GroupStageProgressStatus.COMPLETED
      progress.completed_at = new Date().toISOString()
      mockStorage.set(PROGRESS_KEY, all)
    }
  },

  skipStage: async (groupId: string, sessionStageId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = initProgress()
    const progress = all.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress) {
      progress.status = GroupStageProgressStatus.SKIPPED
      progress.completed_at = new Date().toISOString()
      progress.unlocked_by = userId
      progress.unlock_reason = reason
      mockStorage.set(PROGRESS_KEY, all)
    }
  },

  jumpToStage: async (groupId: string, targetStageId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = initProgress()
    // Reset all stages for this group
    const groupProgress = all.filter((p) => p.group_id === groupId)
    groupProgress.forEach((p) => {
      if (p.session_stage_id === targetStageId) {
        p.status = GroupStageProgressStatus.UNLOCKED
        p.unlocked_by = userId
        p.unlock_reason = reason
      } else {
        p.status = GroupStageProgressStatus.LOCKED
        p.entered_at = undefined
        p.completed_at = undefined
        p.unlocked_by = undefined
        p.unlock_reason = undefined
      }
    })
    mockStorage.set(PROGRESS_KEY, all)
  },

  resetProgress: async (groupId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const all = initProgress()
    const groupProgress = all.filter((p) => p.group_id === groupId)
    groupProgress.forEach((p) => {
      p.status =
        p.session_stage_id === seedSessionStages.find((s) => s.session_id === seedSessionGroups.find((g) => g.id === groupId)?.session_id)?.id
          ? GroupStageProgressStatus.UNLOCKED
          : GroupStageProgressStatus.LOCKED
      p.entered_at = undefined
      p.completed_at = undefined
      p.unlocked_by = userId
      p.unlock_reason = reason
    })
    mockStorage.set(PROGRESS_KEY, all)
  },

  addTimelineEvent: async (
    sessionId: string,
    groupId: string,
    type: TimelineEventRow['type'],
    message: string,
    userId?: string
  ): Promise<void> => {
    const all = initTimeline()
    all.unshift({
      id: `tl-${Date.now()}`,
      session_id: sessionId,
      group_id: groupId,
      type,
      message,
      user_id: userId,
      created_at: new Date().toISOString(),
    })
    mockStorage.set(TIMELINE_KEY, all)
  },

  // Simulation: auto-advance a group's progress (for demo)
  simulateProgress: async (sessionId: string): Promise<void> => {
    const all = initProgress()
    const groups = seedSessionGroups.filter((g) => g.session_id === sessionId)
    for (const group of groups) {
      const activeProgress = all.find(
        (p) => p.group_id === group.id && p.status === GroupStageProgressStatus.IN_PROGRESS
      )
      if (activeProgress) {
        activeProgress.status = GroupStageProgressStatus.COMPLETED
        activeProgress.completed_at = new Date().toISOString()
        // Unlock next stage
        const currentStage = seedSessionStages.find((s) => s.id === activeProgress.session_stage_id)
        if (currentStage) {
          const nextStage = seedSessionStages
            .filter((s) => s.session_id === sessionId)
            .find(
              (s) =>
                s.program_stage_id && currentStage.program_stage_id &&
                parseInt(s.id.replace('ss-', '')) > parseInt(currentStage.id.replace('ss-', ''))
            )
          if (nextStage) {
            const next = all.find(
              (p) => p.group_id === group.id && p.session_stage_id === nextStage.id
            )
            if (next && next.status === GroupStageProgressStatus.LOCKED) {
              next.status = GroupStageProgressStatus.UNLOCKED
            }
          }
        }
      }
    }
    mockStorage.set(PROGRESS_KEY, all)
    // Add timeline event
    const tl = initTimeline()
    tl.unshift({
      id: `tl-${Date.now()}`,
      session_id: sessionId,
      group_id: groups[0]?.id ?? '',
      type: 'group:completed',
      message: `[Simulasi] Kelompok ${groups[0]?.name} maju ke tahap berikutnya`,
      created_at: new Date().toISOString(),
    })
    mockStorage.set(TIMELINE_KEY, tl)
  },
}
