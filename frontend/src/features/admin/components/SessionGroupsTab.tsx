import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import type { SessionGroup, Participant } from '../../../core/types'

interface SessionGroupsTabProps {
  groups: (SessionGroup & { participants: Participant[] })[]
}

export function SessionGroupsTab({ groups }: SessionGroupsTabProps) {
  return (
    <div className="space-y-4">
      {groups?.map((group: SessionGroup & { participants: Participant[] }) => (
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
  )
}
