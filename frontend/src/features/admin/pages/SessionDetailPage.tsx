import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { sessionService } from '../../../core/services/sessions'
import { UserRole } from '../../../core/types/enums'
import { programService } from '../../../core/services/programs'
import { userService } from '../../../core/services/users'
import { ApiError } from '../../../core/services/backendClient'
import { friendlyError } from '../../../core/utils/errorMessages'
import { redirectToLogin } from '../../../core/stores/authStore'
import type { Session, SessionStage, SessionGroup, Participant, User, Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { SessionCreateForm } from '../components/SessionCreateForm'
import { SessionInfoTab } from '../components/SessionInfoTab'
import { SessionStagesTab } from '../components/SessionStagesTab'
import { SessionGroupsTab } from '../components/SessionGroupsTab'

const SessionDetailPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isNew = !sessionId || sessionId === 'new'
  const [session, setSession] = useState<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [activeTab, setActiveTab] = useState('info')
  const [facilitators, setFacilitators] = useState<User[]>([])

  // Create form state
  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(isNew)
  const [programsError, setProgramsError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newProgramId, setNewProgramId] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const programsLoaded = useRef(false)

  const loadSession = async () => {
    if (!sessionId || isNew) return
    setLoading(true)
    try {
      const s = await sessionService.getById(sessionId)
      setSession(s)
      const users = await userService.getAll({ filters: { role: UserRole.FASILITATOR } })
      setFacilitators(users.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSession()
  }, [sessionId])

  useEffect(() => {
    if (!programsLoaded.current) {
      programsLoaded.current = true
      setProgramsLoading(true)
      setProgramsError(null)
      programService.getAll({ limit: 100 }).then((res) => {
        setPrograms(res.data)
        if (isNew && res.data.length > 0) setNewProgramId(res.data[0].id)
      }).catch(() => {
        setProgramsError('Gagal memuat daftar program.')
      }).finally(() => {
        setProgramsLoading(false)
      })
    }
  }, [isNew])

  const programMap = useMemo(() => new Map(programs.map(p => [p.id, p.name])), [programs])
  const [stageMap, setStageMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (session?.program_id) {
      programService.getStages(session.program_id).then((stages) => {
        const map = new Map<string, string>()
        stages.forEach(s => map.set(s.id, s.name))
        setStageMap(map)
      })
    }
  }, [session?.program_id])

  const handleCreate = async () => {
    if (!newName.trim() || !newProgramId || !newDate || !newLocation.trim()) return
    setCreating(true)
    try {
      const created = await sessionService.create({
        program_id: newProgramId, name: newName, session_date: newDate, location: newLocation, notes: newNotes || undefined,
      })
      navigate(`/admin/sessions/${created.id}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        redirectToLogin()
        return
      }
      addToast({ type: 'error', message: friendlyError(err) })
    } finally { setCreating(false) }
  }

  if (isNew) {
    return (
      <div className="space-y-6">
        <PageHeader title="Buat Sesi Baru" subtitle="Tambahkan sesi edutourism baru."
          breadcrumbs={[{ label: 'Sessions', href: ROUTES.ADMIN.SESSIONS }, { label: 'Buat Baru' }]} />
        <Card>
          {programsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : programsError ? (
            <div className="text-center py-12 space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-error" />
              <p className="text-sm text-on-surface-variant">{programsError}</p>
              <Button variant="secondary" size="sm" onClick={() => {
                programsLoaded.current = false
                setProgramsError(null)
                setProgramsLoading(true)
                programService.getAll({ limit: 100 }).then((res) => {
                  setPrograms(res.data)
                  if (res.data.length > 0) setNewProgramId(res.data[0].id)
                }).catch(() => {
                  setProgramsError('Gagal memuat daftar program.')
                }).finally(() => {
                  setProgramsLoading(false)
                })
              }}>
                Coba Lagi
              </Button>
            </div>
          ) : programs.length === 0 ? (
            <EmptyState
              icon={<AlertCircle className="w-12 h-12" />}
              title="Belum ada program"
              description="Buat program terlebih dahulu sebelum membuat sesi baru."
              action={{ label: 'Ke Halaman Program', onClick: () => navigate(ROUTES.ADMIN.PROGRAMS) }}
            />
          ) : (
            <SessionCreateForm
              programs={programs}
              newName={newName} setNewName={setNewName}
              newProgramId={newProgramId} setNewProgramId={setNewProgramId}
              newDate={newDate} setNewDate={setNewDate}
              newLocation={newLocation} setNewLocation={setNewLocation}
              newNotes={newNotes} setNewNotes={setNewNotes}
              creating={creating} onCancel={() => navigate(ROUTES.ADMIN.SESSIONS)} onSubmit={handleCreate} />
          )}
        </Card>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!session) return <div className="text-center text-on-surface-variant">Session not found</div>

  return (
    <div className="space-y-6">
      <PageHeader title={session.name} subtitle={`${session.location} · ${formatDate(session.session_date)}`}
        breadcrumbs={[{ label: 'Sessions', href: ROUTES.ADMIN.SESSIONS }, { label: session.name }]}
        actions={<Badge variant={session.status === 'ACTIVE' ? 'success' : session.status === 'COMPLETED' ? 'primary' : 'neutral'}>{session.status}</Badge>}
      />

      <Tabs tabs={[{ key: 'info', label: 'Info' }, { key: 'stages', label: 'Stages' }, { key: 'groups', label: 'Groups' }]}
        activeKey={activeTab} onChange={setActiveTab} />

      {activeTab === 'info' && <SessionInfoTab session={session} programName={programMap.get(session.program_id) || session.program_id} />}
      {activeTab === 'stages' && <SessionStagesTab stages={session.stages} facilitators={facilitators} sessionId={sessionId!} stageMap={stageMap} />}
      {activeTab === 'groups' && <SessionGroupsTab sessionId={sessionId!} sessionStatus={session.status} groups={session.groups} onRefresh={loadSession} />}
    </div>
  )
}

export default SessionDetailPage
