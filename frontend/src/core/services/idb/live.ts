import { GroupStageProgressStatus, SessionStage, SessionGroup, Participant } from '../../types'
import { getAll, getById, put, putMany, queryByIndex } from '../storage/idb'

const PROGRESS_STORE = 'group_stage_progress'
const TIMELINE_STORE = 'timeline_events'

async function getSortedStages(sessionId: string) {
  let stages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
  if (stages.length === 0) {
    const all = await getAll<SessionStage>('session_stages')
    stages = all.filter((s) => s.session_id === sessionId)
    if (stages.length > 0) {
      console.warn(`[live] getSortedStages: queryByIndex gagal, fallback ke getAll + filter (session ${sessionId})`)
    }
  }
  const programStages = await getAll<{ id: string; sequence_order: number }>('program_stages')
  return stages
    .map((ss) => {
      const ps = programStages.find((p) => p.id === ss.program_stage_id)
      return { ...ss, sequence: ps?.sequence_order ?? 999 }
    })
    .sort((a, b) => a.sequence - b.sequence)
}

async function getGroupRecord(groupId: string): Promise<SessionGroup | null> {
  return getById<SessionGroup>('session_groups', groupId)
}

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

export interface LiveGroupWithProgress {
  group: SessionGroup
  progress: GroupStageProgressRow[]
  participants: Participant[]
}

export const idbLiveService = {
  getProgress: async (sessionId: string): Promise<GroupStageProgressRow[]> => {
    await new Promise((r) => setTimeout(r, 100))
    const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
    const stageIds = stages.map((s) => s.id)
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    return allProgress.filter((p) => stageIds.includes(p.session_stage_id))
  },

  getGroupsWithProgress: async (sessionId: string): Promise<LiveGroupWithProgress[]> => {
    await new Promise((r) => setTimeout(r, 150))
    const groups = await queryByIndex<SessionGroup>('session_groups', 'session_id', sessionId)
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    
    return await Promise.all(
      groups.map(async (group) => ({
        group,
        progress: allProgress.filter((p) => p.group_id === group.id),
        participants: await queryByIndex<Participant>('participants', 'group_id', group.id),
      }))
    )
  },

  getTimeline: async (sessionId: string): Promise<TimelineEventRow[]> => {
    await new Promise((r) => setTimeout(r, 100))
    const allEvents = await getAll<TimelineEventRow>(TIMELINE_STORE)
    return allEvents
      .filter((t) => t.session_id === sessionId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  initGroupProgress: async (sessionId: string): Promise<void> => {
    const groups = await queryByIndex<SessionGroup>('session_groups', 'session_id', sessionId)
    if (groups.length === 0) return

    const sortedStages = await getSortedStages(sessionId)
    if (sortedStages.length === 0) {
      console.warn(`[live] initGroupProgress: tidak ada session_stages untuk session ${sessionId}; progress tidak dibuat`)
      return
    }

    const firstStageId = sortedStages[0]?.id
    const existingProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)

    const newRecords: GroupStageProgressRow[] = []
    for (const group of groups) {
      for (const stage of sortedStages) {
        const exists = existingProgress.some(
          (p) => p.group_id === group.id && p.session_stage_id === stage.id
        )
        if (exists) continue
        newRecords.push({
          id: `gsp-${group.id}-${stage.id}`,
          group_id: group.id,
          session_stage_id: stage.id,
          status: stage.id === firstStageId
            ? GroupStageProgressStatus.UNLOCKED
            : GroupStageProgressStatus.LOCKED,
          entered_at: stage.id === firstStageId ? new Date().toISOString() : undefined,
        })
      }
      if (!group.current_stage_id && firstStageId) {
        group.current_stage_id = firstStageId
        await put('session_groups', group)
      }
    }

    if (newRecords.length > 0) {
      await putMany(PROGRESS_STORE, newRecords)
    }
  },

  unlockStage: async (groupId: string, sessionStageId: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const progress = allProgress.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress && progress.status === GroupStageProgressStatus.LOCKED) {
      progress.status = GroupStageProgressStatus.UNLOCKED
      progress.unlocked_by = userId
      await put(PROGRESS_STORE, progress)
      const groupRecord = await getGroupRecord(groupId)
      if (groupRecord) {
        groupRecord.current_stage_id = sessionStageId
        await put('session_groups', groupRecord)
      }
    }
  },

  completeStage: async (groupId: string, sessionStageId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const progress = allProgress.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress && progress.status === GroupStageProgressStatus.IN_PROGRESS) {
      progress.status = GroupStageProgressStatus.COMPLETED
      progress.completed_at = new Date().toISOString()
      await put(PROGRESS_STORE, progress)
    }
  },

  skipStage: async (groupId: string, sessionStageId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const progress = allProgress.find(
      (p) => p.group_id === groupId && p.session_stage_id === sessionStageId
    )
    if (progress) {
      progress.status = GroupStageProgressStatus.SKIPPED
      progress.completed_at = new Date().toISOString()
      progress.unlocked_by = userId
      progress.unlock_reason = reason
      await put(PROGRESS_STORE, progress)

      const groupRecord = await getGroupRecord(groupId)
      if (groupRecord) {
        const sortedStages = await getSortedStages(groupRecord.session_id)
        const currentIndex = sortedStages.findIndex((s) => s.id === sessionStageId)
        const nextStage = sortedStages[currentIndex + 1]
        if (nextStage) {
          const groupProgress = allProgress.filter((p) => p.group_id === groupId)
          const nextProgress = groupProgress.find((p) => p.session_stage_id === nextStage.id)
          if (nextProgress && nextProgress.status === GroupStageProgressStatus.LOCKED) {
            nextProgress.status = GroupStageProgressStatus.UNLOCKED
            await put(PROGRESS_STORE, nextProgress)
            groupRecord.current_stage_id = nextStage.id
          }
        }
        await put('session_groups', groupRecord)
      }
    }
  },

  jumpToStage: async (groupId: string, targetStageId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const groupProgress = allProgress.filter((p) => p.group_id === groupId)

    for (const p of groupProgress) {
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
      await put(PROGRESS_STORE, p)
    }

    const groupRecord = await getGroupRecord(groupId)
    if (groupRecord) {
      groupRecord.current_stage_id = targetStageId
      await put('session_groups', groupRecord)
    }
  },

  resetProgress: async (groupId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const groupProgress = allProgress.filter((p) => p.group_id === groupId)

    const groupRecord = await getGroupRecord(groupId)
    if (!groupRecord) return

    const sortedStages = await getSortedStages(groupRecord.session_id)
    const firstStageId = sortedStages[0]?.id

    // Self-heal: create progress records if missing for this group
    if (groupProgress.length === 0) {
      const newRecords: GroupStageProgressRow[] = []
      for (const stage of sortedStages) {
        newRecords.push({
          id: `gsp-${groupId}-${stage.id}`,
          group_id: groupId,
          session_stage_id: stage.id,
          status: stage.id === firstStageId
            ? GroupStageProgressStatus.UNLOCKED
            : GroupStageProgressStatus.LOCKED,
          entered_at: stage.id === firstStageId ? new Date().toISOString() : undefined,
        })
      }
      if (newRecords.length > 0) await putMany(PROGRESS_STORE, newRecords)
      groupRecord.current_stage_id = firstStageId
      await put('session_groups', groupRecord)
      return
    }

    for (const p of groupProgress) {
      p.status = p.session_stage_id === firstStageId
        ? GroupStageProgressStatus.UNLOCKED
        : GroupStageProgressStatus.LOCKED
      p.entered_at = undefined
      p.completed_at = undefined
      p.unlocked_by = userId
      p.unlock_reason = reason
      await put(PROGRESS_STORE, p)
    }

    groupRecord.current_stage_id = firstStageId
    await put('session_groups', groupRecord)
  },

  addTimelineEvent: async (
    sessionId: string,
    groupId: string,
    type: TimelineEventRow['type'],
    message: string,
    userId?: string
  ): Promise<void> => {
    const event: TimelineEventRow = {
      id: `tl-${Date.now()}`,
      session_id: sessionId,
      group_id: groupId,
      type,
      message,
      user_id: userId,
      created_at: new Date().toISOString(),
    }
    await put(TIMELINE_STORE, event)
  },

  simulateProgress: async (sessionId: string): Promise<void> => {
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const groups = await queryByIndex<SessionGroup>('session_groups', 'session_id', sessionId)
    const sortedStages = await getSortedStages(sessionId)

    // Self-heal: ensure every group has progress records before simulating
    for (const group of groups) {
      const groupProgress = allProgress.filter((p) => p.group_id === group.id)
      if (groupProgress.length === 0) {
        await idbLiveService.initGroupProgress(sessionId)
        break
      }
    }

    const refreshedProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)

    for (const group of groups) {
      const groupProgress = refreshedProgress.filter((p) => p.group_id === group.id)

      const unlocked = groupProgress.find(
        (p) => p.status === GroupStageProgressStatus.UNLOCKED
      )
      if (unlocked) {
        unlocked.status = GroupStageProgressStatus.IN_PROGRESS
        unlocked.entered_at = new Date().toISOString()
        await put(PROGRESS_STORE, unlocked)
        continue
      }

      const active = groupProgress.find(
        (p) => p.status === GroupStageProgressStatus.IN_PROGRESS
      )
      if (active) {
        active.status = GroupStageProgressStatus.COMPLETED
        active.completed_at = new Date().toISOString()
        await put(PROGRESS_STORE, active)

        const currentIndex = sortedStages.findIndex((s) => s.id === active.session_stage_id)
        const nextStage = sortedStages[currentIndex + 1]
        if (nextStage) {
          const next = groupProgress.find(
            (p) => p.session_stage_id === nextStage.id
          )
          if (next && next.status === GroupStageProgressStatus.LOCKED) {
            next.status = GroupStageProgressStatus.UNLOCKED
            await put(PROGRESS_STORE, next)
            group.current_stage_id = nextStage.id
            await put('session_groups', group)
          }
        }
      }
    }

    if (groups.length > 0) {
      await idbLiveService.addTimelineEvent(
        sessionId,
        groups[0].id,
        'group:completed',
        '[Simulasi] Progress diperbarui'
      )
    }
  },
}
