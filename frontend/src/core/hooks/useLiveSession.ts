import { useState, useEffect, useCallback, useRef } from 'react'

import { openSSE, subscribeConnection, type ConnectionState } from '../services/backendClient'
import { arrayRequest } from '../services/apiEnvelope'
import type { TimelineEventRow } from '../services/live'
import type {
  SessionGroup,
  GroupStageProgress,
  Participant,
} from '../types'

// Live dashboard state for a single session. The single source of truth is the
// backend SSE stream (plus POST action responses); this hook never fabricates
// progress locally.
export interface LiveSessionState {
  groups: SessionGroup[]
  progress: GroupStageProgress[]
  participantsByGroup: Record<string, Participant[]>
  timeline: TimelineEventRow[]
  connectionStatus: ConnectionState
}

interface SSEEvent {
  type: string
  data: unknown
}

interface SnapshotGroupEntry {
  group: SessionGroup
  progress: GroupStageProgress[]
  participants: Participant[]
}

interface SnapshotData {
  groups?: SnapshotGroupEntry[]
  progress?: GroupStageProgress[]
  timeline?: TimelineEventRow[]
}

// The backend SSE channel emits named events. `source.onmessage` only fires for
// unnamed events, so we must register a listener per event type.
const STAGE_EVENTS = ['stage:unlock', 'stage:complete', 'stage:skip'] as const
const GROUP_EVENTS = ['group:jump', 'group:reset'] as const
const TIMELINE_EVENTS = ['timeline:override', 'timeline:group:progress', 'timeline:group:completed', 'timeline:stage:unlock'] as const

// Best-effort per-group participant map (the SSE snapshot does not include
// participants). Backed by the global participant endpoint, scoped by session_id.
async function loadParticipantsByGroup(sessionId: string): Promise<Record<string, Participant[]>> {
  try {
    const all = await arrayRequest<Participant>(
      'GET',
      `/api/participants?session_id=${encodeURIComponent(sessionId)}`,
    )
    const map: Record<string, Participant[]> = {}
    for (const p of all) {
      const gid = p.group_id
      if (!gid) continue
      ;(map[gid] ??= []).push(p)
    }
    return map
  } catch {
    return {}
  }
}

export function useLiveSession(sessionId: string | null | undefined) {
  const [state, setState] = useState<LiveSessionState>({
    groups: [],
    progress: [],
    participantsByGroup: {},
    timeline: [],
    connectionStatus: 'online',
  })
  const [loading, setLoading] = useState<boolean>(true)

  // Track the latest seen timeline id so we can dedupe echoes.
  const seenTimelineIds = useRef<Set<string>>(new Set())

  const handleEvent = useCallback((ev: SSEEvent) => {
    const { type, data } = ev

    if (type === 'snapshot') {
      const snap = (data ?? {}) as SnapshotData
      const timeline = (snap.timeline ?? []).slice().sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      seenTimelineIds.current = new Set(timeline.map((t) => t.id))

      const flatGroups: SessionGroup[] = []
      const flatProgress: GroupStageProgress[] = []
      const participantMap: Record<string, Participant[]> = {}
      for (const entry of snap.groups ?? []) {
        flatGroups.push(entry.group)
        flatProgress.push(...(entry.progress ?? []))
        participantMap[entry.group.id] = entry.participants ?? []
      }

      setState((prev) => ({
        ...prev,
        groups: flatGroups,
        progress: snap.progress ?? flatProgress,
        timeline,
        participantsByGroup: participantMap,
      }))
      setLoading(false)
      return
    }

    if ((STAGE_EVENTS as readonly string[]).includes(type)) {
      // data is a GroupStageProgress row.
      const row = data as GroupStageProgress
      setState((prev) => {
        const progress = prev.progress.filter(
          (p) => !(p.group_id === row.group_id && p.session_stage_id === row.session_stage_id),
        )
        progress.push(row)
        return { ...prev, progress }
      })
      return
    }

    if ((GROUP_EVENTS as readonly string[]).includes(type)) {
      // data is a SessionGroup row.
      const g = data as SessionGroup
      setState((prev) => {
        const groups = prev.groups.map((x) => (x.id === g.id ? g : x))
        if (!groups.some((x) => x.id === g.id)) groups.push(g)
        return { ...prev, groups }
      })
      return
    }

    if ((TIMELINE_EVENTS as readonly string[]).includes(type)) {
      // data is a TimelineEvent row.
      const t = data as TimelineEventRow
      if (seenTimelineIds.current.has(t.id)) return
      seenTimelineIds.current.add(t.id)
      setState((prev) => ({
        ...prev,
        timeline: [t, ...prev.timeline]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }))
      return
    }
  }, [])

  // Open SSE + subscribe to connection state.
  useEffect(() => {
    if (!sessionId) {
      setState((prev) => ({ ...prev, groups: [], progress: [], timeline: [], participantsByGroup: {} }))
      setLoading(false)
      return
    }

    setLoading(true)
    seenTimelineIds.current = new Set()

    const source = openSSE(`/api/live/${sessionId}/stream`, () => {
      // onMessage tidak dipakai — semua event ditangani oleh addEventListener di bawah
    })

    source.addEventListener('snapshot', (e) => {
      const parsed = (() => { try { return JSON.parse((e as MessageEvent).data) } catch { return null } })()
      handleEvent({ type: 'snapshot', data: parsed })
    })
    for (const t of STAGE_EVENTS) {
      source.addEventListener(t, (e) => {
        const parsed = (() => { try { return JSON.parse((e as MessageEvent).data) } catch { return null } })()
        handleEvent({ type: t, data: parsed })
      })
    }
    for (const t of GROUP_EVENTS) {
      source.addEventListener(t, (e) => {
        const parsed = (() => { try { return JSON.parse((e as MessageEvent).data) } catch { return null } })()
        handleEvent({ type: t, data: parsed })
      })
    }
    for (const t of TIMELINE_EVENTS) {
      source.addEventListener(t, (e) => {
        const parsed = (() => { try { return JSON.parse((e as MessageEvent).data) } catch { return null } })()
        handleEvent({ type: t, data: parsed })
      })
    }

    source.onerror = () => {
      // EventSource auto-reconnects; reflect reconnecting state until the
      // connection store reports otherwise. Always clear the skeleton so a
      // failed connection (e.g. 401/400/CORS/offline) doesn't spin forever.
      setLoading(false)
      setState((prev) => ({ ...prev, connectionStatus: 'reconnecting' }))
    }

    const unsub = subscribeConnection((s) => {
      setState((prev) => ({ ...prev, connectionStatus: s }))
    })

    return () => {
      source.close()
      unsub()
    }
  }, [sessionId, handleEvent])

  // Pull participants when the session changes (SSE snapshot omits them).
  useEffect(() => {
    if (!sessionId) return
    let alive = true
    void loadParticipantsByGroup(sessionId).then((map) => {
      if (alive) setState((prev) => ({ ...prev, participantsByGroup: map }))
    })
    return () => { alive = false }
  }, [sessionId])

  return {
    ...state,
    loading,
  }
}
