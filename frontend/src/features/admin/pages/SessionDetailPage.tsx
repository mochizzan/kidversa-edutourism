import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { sessionService } from '../../../core/services/sessions'
import { programService } from '../../../core/services/programs'
import { userService } from '../../../core/services/users'
import type { Session, SessionStage, SessionGroup, Participant, User, Program } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

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

  const handleCreate = async () => {
    if (!newName.trim() || !newProgramId || !newDate || !newLocation.trim()) return
    setCreating(true)
    try {
      const created = await sessionService.create({
        program_id: newProgramId,
        name: newName,
        session_date: newDate,
        location: newLocation,
        notes: newNotes || undefined,
      })
      navigate(`/admin/sessions/${created.id}`, { replace: true })
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!sessionId) return
    ;(async () => {
      setLoading(true)
      const s = await sessionService.getById(sessionId)
      setSession(s)
      const users = await userService.getAll({ filters: { role: 'FASILITATOR' } })
      setFacilitators(users.data)
      setLoading(false)
    })()
  }, [sessionId])

  if (isNew) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Buat Sesi Baru"
          subtitle="Tambahkan sesi edutourism baru."
          breadcrumbs={[
            { label: 'Sessions', href: '/admin/sessions' },
            { label: 'Buat Baru' },
          ]}
        />

        <Card>
          <form
            className="space-y-4 max-w-2xl"
            onSubmit={(e) => { e.preventDefault(); handleCreate() }}
          >
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Nama Sesi *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                placeholder="Nama sesi"
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Program *</label>
              <select
                value={newProgramId}
                onChange={(e) => setNewProgramId(e.target.value)}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                required
                disabled={creating}
              >
                <option value="">Pilih program</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Tanggal *</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Lokasi *</label>
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                placeholder="Lokasi sesi"
                required
                disabled={creating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1">Catatan</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                rows={3}
                placeholder="Catatan (opsional)"
                disabled={creating}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => navigate('/admin/sessions')}
                disabled={creating}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={creating || !newName.trim() || !newProgramId || !newDate || !newLocation.trim()}
              >
                {creating ? 'Menyimpan…' : 'Simpan Sesi'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    )
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!session) return <div className="text-center text-on-surface-variant">Session not found</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name}
        subtitle={`${session.location} · ${formatDate(session.session_date)}`}
        breadcrumbs={[
          { label: 'Sessions', href: '/admin/sessions' },
          { label: session.name },
        ]}
        actions={
          <Badge variant={session.status === 'ACTIVE' ? 'success' : session.status === 'COMPLETED' ? 'primary' : 'neutral'}>{session.status}</Badge>
        }
      />

      <Tabs
        tabs={[
          { key: 'info', label: 'Info' },
          { key: 'stages', label: 'Stages' },
          { key: 'groups', label: 'Groups' },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'info' && (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-on-surface-variant">Program</p>
              <p className="font-medium text-on-surface">{session.program_id}</p>
            </div>
            <div>
              <p className="text-sm text-on-surface-variant">Lokasi</p>
              <p className="font-medium text-on-surface">{session.location}</p>
            </div>
            <div>
              <p className="text-sm text-on-surface-variant">Tanggal</p>
              <p className="font-medium text-on-surface">{formatDate(session.session_date)}</p>
            </div>
            <div>
              <p className="text-sm text-on-surface-variant">Catatan</p>
              <p className="font-medium text-on-surface">{session.notes || '-'}</p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'stages' && (
        <Card>
          <div className="space-y-3">
            {session.stages?.map((stage: SessionStage) => (
              <div key={stage.id} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl">
                <div>
                  <p className="font-medium text-on-surface">{stage.program_stage_id}</p>
                  <p className="text-sm text-on-surface-variant">Status: {stage.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={stage.fasilitator_id || ''}
                    onChange={(e) => sessionService.assignFacilitator(sessionId!, stage.id, e.target.value)}
                    className="rounded-xl border border-outline-variant px-3 py-1.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
                  >
                    <option value="">Pilih Fasilitator</option>
                    {facilitators.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'groups' && (
        <div className="space-y-4">
          {session.groups?.map((group: SessionGroup & { participants: Participant[] }) => (
            <Card key={group.id} title={group.name}>
              <div className="space-y-2">
                {group.participants?.map((participant: Participant) => (
                  <div key={participant.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                    <div>
                      <p className="font-medium text-on-surface">{participant.child_name}</p>
                      <p className="text-sm text-on-surface-variant">Umur {participant.child_age} · {participant.parent_name}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={participant.consent_recording ? 'success' : 'danger'}>Recording</Badge>
                      <Badge variant={participant.consent_photo ? 'success' : 'danger'}>Photo</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default SessionDetailPage
