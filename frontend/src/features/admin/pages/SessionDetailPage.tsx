import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { sessionService } from '../../../core/services/sessions'
import { programService } from '../../../core/services/programs'
import { userService } from '../../../core/services/users'
import type { Session, SessionStage, SessionGroup, Participant, User, Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { SessionCreateForm } from '../components/SessionCreateForm'
import { SessionInfoTab } from '../components/SessionInfoTab'
import { SessionStagesTab } from '../components/SessionStagesTab'
import { SessionGroupsTab } from '../components/SessionGroupsTab'

const SessionDetailPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const isNew = sessionId === 'new'
  const [session, setSession] = useState<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState('info')
  const [facilitators, setFacilitators] = useState<User[]>([])

  // Create form state
  const [programs, setPrograms] = useState<Program[]>([])
  const [newName, setNewName] = useState('')
  const [newProgramId, setNewProgramId] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const programsLoaded = useRef(false)

  useEffect(() => {
    if (!sessionId || isNew) return
    ;(async () => {
      setLoading(true)
      const s = await sessionService.getById(sessionId)
      setSession(s)
      const users = await userService.getAll({ filters: { role: 'FASILITATOR' } })
      setFacilitators(users.data)
      setLoading(false)
    })()
  }, [sessionId])

  useEffect(() => {
    if (isNew && !programsLoaded.current) {
      programService.getAll({ limit: 100 }).then((res) => {
        setPrograms(res.data)
        if (res.data.length > 0) setNewProgramId(res.data[0].id)
      })
      programsLoaded.current = true
    }
  }, [isNew])

  const programMap = useMemo(() => new Map(programs.map(p => [p.id, p.name])), [programs])
  const stageMap = useMemo(() => {
    const map = new Map<string, string>()
    programs.forEach(p => {
      if ('stages' in p) {
        (p.stages as Array<{ id: string; name: string }>)?.forEach(s => map.set(s.id, s.name))
      }
    })
    return map
  }, [programs])

  const handleCreate = async () => {
    if (!newName.trim() || !newProgramId || !newDate || !newLocation.trim()) return
    setCreating(true)
    try {
      const created = await sessionService.create({
        program_id: newProgramId, name: newName, session_date: newDate, location: newLocation, notes: newNotes || undefined,
      })
      navigate(`/admin/sessions/${created.id}`, { replace: true })
    } finally { setCreating(false) }
  }

  if (isNew) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buat Sesi Baru" subtitle="Tambahkan sesi edutourism baru."
          breadcrumbs={[{ label: 'Sessions', href: '/admin/sessions' }, { label: 'Buat Baru' }]} />
        <Card>
          <SessionCreateForm
            programs={programs}
            newName={newName} setNewName={setNewName}
            newProgramId={newProgramId} setNewProgramId={setNewProgramId}
            newDate={newDate} setNewDate={setNewDate}
            newLocation={newLocation} setNewLocation={setNewLocation}
            newNotes={newNotes} setNewNotes={setNewNotes}
            creating={creating} onCancel={() => navigate('/admin/sessions')} onSubmit={handleCreate} />
        </Card>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!session) return <div className="text-center text-on-surface-variant">Session not found</div>

  return (
    <div className="space-y-6">
      <PageHeader title={session.name} subtitle={`${session.location} · ${formatDate(session.session_date)}`}
        breadcrumbs={[{ label: 'Sessions', href: '/admin/sessions' }, { label: session.name }]}
        actions={<Badge variant={session.status === 'ACTIVE' ? 'success' : session.status === 'COMPLETED' ? 'primary' : 'neutral'}>{session.status}</Badge>}
      />

      <Tabs tabs={[{ key: 'info', label: 'Info' }, { key: 'stages', label: 'Stages' }, { key: 'groups', label: 'Groups' }]}
        activeKey={activeTab} onChange={setActiveTab} />

      {activeTab === 'info' && <SessionInfoTab session={session} programName={programMap.get(session.program_id) || session.program_id} />}
      {activeTab === 'stages' && <SessionStagesTab stages={session.stages} facilitators={facilitators} sessionId={sessionId!} stageMap={stageMap} />}
      {activeTab === 'groups' && <SessionGroupsTab groups={session.groups} />}
    </div>
  )
}

export default SessionDetailPage
