// live.ts — backend-backed live-session service (Fase 5).
//
// Replaces the old IndexedDB-backed `idb/live.ts`. The backend exposes
// `/api/live/:sessionId/groups` (snapshot: groups + progress + timeline),
// `/api/live/:sessionId/timeline`, facilitator overrides, jump/reset, and
// `/api/live/events` for publishing timeline events. Live deltas arrive via
// SSE (see backendClient.openSSE) and are consumed by the monitor pages.
//
// The returned `SessionGroup` / `GroupStageProgress` / `TimelineEvent` shapes
// match the backend entity JSON (see backend/internal/domain/entity).

import { GroupStageProgressStatus, type SessionGroup, type Participant } from '../types'
import { apiRequest } from './backendClient'

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

interface GroupsEnvelope {
  groups: LiveGroupWithProgress[]
}

interface TimelineEnvelope {
  timeline: TimelineEventRow[]
}

interface LiveSnapshot {
  groupsWithProgress: LiveGroupWithProgress[]
  progress: GroupStageProgressRow[]
  timeline: TimelineEventRow[]
}

// Snapshot of a session: groups (each with progress + participants), the flat
// progress list, and the timeline events. Drives the monitor/list pages.
async function fetchSnapshot(sessionId: string): Promise<LiveSnapshot> {
  const [groupsRes, timelineRes] = await Promise.all([
    apiRequest<GroupsEnvelope>('GET', `/api/live/${sessionId}/groups`),
    apiRequest<TimelineEnvelope>('GET', `/api/live/${sessionId}/timeline`),
  ])

  const groupsWithProgress = groupsRes.groups ?? []
  // Build a flat progress list from the nested groups.
  const progress: GroupStageProgressRow[] = []
  for (const g of groupsWithProgress) {
    progress.push(...(g.progress ?? []))
  }

  return {
    groupsWithProgress,
    progress,
    timeline: (timelineRes.timeline ?? []).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    ),
  }
}

// R1: getProgress/getGroupsWithProgress/getTimeline previously each triggered a
// full snapshot load (6 API calls when a page reads all three in one render).
// Cache the in-flight snapshot per sessionId within a short TTL so those calls
// collapse into a single load while staying fresh across renders. Mutations
// invalidate the cache so the next read re-fetches.
const SNAPSHOT_TTL_MS = 2000
const snapshotCache = new Map<string, { at: number; promise: Promise<LiveSnapshot> }>()

function loadSnapshot(sessionId: string): Promise<LiveSnapshot> {
  const cached = snapshotCache.get(sessionId)
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) {
    return cached.promise
  }
  const promise = fetchSnapshot(sessionId)
  snapshotCache.set(sessionId, { at: Date.now(), promise })
  // On failure, drop the cache entry so the next call retries.
  promise.catch(() => snapshotCache.delete(sessionId))
  return promise
}

function invalidateSnapshot(sessionId?: string): void {
  if (sessionId) snapshotCache.delete(sessionId)
  else snapshotCache.clear()
}

export const liveService = {
  getProgress: async (sessionId: string): Promise<GroupStageProgressRow[]> => {
    const { progress } = await loadSnapshot(sessionId)
    return progress
  },

  getGroupsWithProgress: async (sessionId: string): Promise<LiveGroupWithProgress[]> => {
    const { groupsWithProgress } = await loadSnapshot(sessionId)
    return groupsWithProgress
  },

  getTimeline: async (sessionId: string): Promise<TimelineEventRow[]> => {
    const { timeline } = await loadSnapshot(sessionId)
    return timeline
  },

  // Facilitator overrides — POST /api/live/groups/:groupId/stages/:stageId/{unlock,complete,skip}
  unlockStage: async (groupId: string, sessionStageId: string, userId: string): Promise<void> => {
    await apiRequest('POST', `/api/live/groups/${groupId}/stages/${sessionStageId}/unlock`, { userId })
    invalidateSnapshot()
  },

  completeStage: async (groupId: string, sessionStageId: string): Promise<void> => {
    await apiRequest('POST', `/api/live/groups/${groupId}/stages/${sessionStageId}/complete`)
    invalidateSnapshot()
  },

  skipStage: async (groupId: string, sessionStageId: string, reason: string, userId: string): Promise<void> => {
    await apiRequest('POST', `/api/live/groups/${groupId}/stages/${sessionStageId}/skip`, { reason, userId })
    invalidateSnapshot()
  },

  jumpToStage: async (groupId: string, targetStageId: string, reason: string, userId: string): Promise<void> => {
    await apiRequest('POST', `/api/live/groups/${groupId}/jump`, { stage_id: targetStageId, reason, userId })
    invalidateSnapshot()
  },

  resetProgress: async (groupId: string, reason: string, userId: string): Promise<void> => {
    await apiRequest('POST', `/api/live/groups/${groupId}/reset`, { reason, userId })
    invalidateSnapshot()
  },

  addTimelineEvent: async (
    sessionId: string,
    groupId: string,
    type: TimelineEventRow['type'],
    message: string,
    userId?: string,
  ): Promise<void> => {
    await apiRequest('POST', `/api/live/events`, { session_id: sessionId, group_id: groupId, type, message, user_id: userId })
    invalidateSnapshot(sessionId)
  },

  // Live progress is driven by the backend + SSE; the frontend no longer
  // fabricates progress locally. Kept as a no-op so existing call sites
  // (LiveMonitorPage) keep working without a rewrite.
  simulateProgress: async (_sessionId: string): Promise<void> => {
    // no-op: backend owns live state
  },

  initGroupProgress: async (_sessionId: string): Promise<void> => {
    // no-op: backend initializes progress on session start
  },
}

export type { GroupStageProgressRow as GroupStageProgress, TimelineEventRow as TimelineEvent }
