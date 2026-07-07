import { GroupStageProgressStatus, SessionStage, SessionGroup, Participant } from '../../types'
import { getAll, put, queryByIndex } from '../storage/idb'

const PROGRESS_STORE = 'group_stage_progress'
const TIMELINE_STORE = 'timeline_events'

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

export const mockLiveService = {
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
  },

  resetProgress: async (groupId: string, reason: string, userId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200))
    const allProgress = await getAll<GroupStageProgressRow>(PROGRESS_STORE)
    const groupProgress = allProgress.filter((p) => p.group_id === groupId)

    if (groupProgress.length === 0) return

    const group = await queryByIndex<SessionGroup>('session_groups', 'id', groupId)
    const groupData = group[0]
    if (!groupData) return

    const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', groupData.session_id)
    
    const programStages = await getAll<{ id: string; sequence_order: number }>('program_stages')
    const sortedStages = stages
      .map((ss) => {
        const ps = programStages.find((p) => p.id === ss.program_stage_id)
        return { ...ss, sequence: ps?.sequence_order ?? 999 }
      })
      .sort((a, b) => a.sequence - b.sequence)

    const firstStageId = sortedStages[0]?.id

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
    const stages = await queryByIndex<SessionStage>('session_stages', 'session_id', sessionId)
    
    for (const group of groups) {
      const activeProgress = allProgress.find(
        (p) => p.group_id === group.id && p.status === GroupStageProgressStatus.IN_PROGRESS
      )
      
      if (activeProgress) {
        activeProgress.status = GroupStageProgressStatus.COMPLETED
        activeProgress.completed_at = new Date().toISOString()
        await put(PROGRESS_STORE, activeProgress)
        
        const currentStage = stages.find((s) => s.id === activeProgress.session_stage_id)
        if (currentStage) {
          const sortedStages = stages
            .filter((s) => s.session_id === sessionId)
            .sort((a, b) => parseInt(a.id.replace('ss-', '')) - parseInt(b.id.replace('ss-', '')))
          
          const currentIndex = sortedStages.findIndex((s) => s.id === currentStage.id)
          const nextStage = sortedStages[currentIndex + 1]
          
          if (nextStage) {
            const next = allProgress.find(
              (p) => p.group_id === group.id && p.session_stage_id === nextStage.id
            )
            if (next && next.status === GroupStageProgressStatus.LOCKED) {
              next.status = GroupStageProgressStatus.UNLOCKED
              await put(PROGRESS_STORE, next)
            }
          }
        }
      }
    }
    
    if (groups.length > 0) {
      await mockLiveService.addTimelineEvent(
        sessionId,
        groups[0].id,
        'group:completed',
        `[Simulasi] Kelompok ${groups[0].name} maju ke tahap berikutnya`
      )
    }
  },
}
