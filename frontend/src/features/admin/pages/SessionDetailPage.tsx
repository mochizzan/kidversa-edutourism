import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Card } from '../../../shared/components/ui/Card'
import { sessionService } from '../../../core/services/sessions'
import { userService } from '../../../core/services/users'
import type { Session, SessionStage, SessionGroup, Participant, User } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

const SessionDetailPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [session, setSession] = useState<(Session & { stages: SessionStage[]; groups: (SessionGroup & { participants: Participant[] })[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [facilitators, setFacilitators] = useState<User[]>([])

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

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!session) return <div className="text-center text-gray-500">Session not found</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/sessions">
          <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{session.location} · {formatDate(session.session_date)}</p>
        </div>
        <Badge variant={session.status === 'ACTIVE' ? 'success' : session.status === 'COMPLETED' ? 'primary' : 'neutral'}>{session.status}</Badge>
      </div>

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
              <p className="text-sm text-gray-500">Program</p>
              <p className="font-medium text-gray-900">{session.program_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lokasi</p>
              <p className="font-medium text-gray-900">{session.location}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tanggal</p>
              <p className="font-medium text-gray-900">{formatDate(session.session_date)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Catatan</p>
              <p className="font-medium text-gray-900">{session.notes || '-'}</p>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'stages' && (
        <Card>
          <div className="space-y-3">
            {session.stages?.map((stage: SessionStage) => (
              <div key={stage.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{stage.program_stage_id}</p>
                  <p className="text-sm text-gray-500">Status: {stage.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={stage.fasilitator_id || ''}
                    onChange={(e) => sessionService.assignFacilitator(sessionId!, stage.id, e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:ring-2 focus:ring-primary-100 focus:outline-none"
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
                  <div key={participant.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{participant.child_name}</p>
                      <p className="text-sm text-gray-500">Umur {participant.child_age} · {participant.parent_name}</p>
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
