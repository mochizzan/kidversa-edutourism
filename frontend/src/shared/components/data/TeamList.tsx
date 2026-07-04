import { useState } from 'react'
import { UserPlus, Check } from 'lucide-react'
import { cn } from '../../../core/utils'

interface TeamMember {
  id: string
  name: string
  role: string
  avatar: string
}

interface TeamListProps {
  members: TeamMember[]
}

function TeamMemberItem({ member }: { member: TeamMember }) {
  const [following, setFollowing] = useState(false)

  return (
    <li className="flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm shrink-0">
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface truncate">{member.name}</p>
        <p className="text-xs text-on-surface-variant">{member.role}</p>
      </div>
      <button
        onClick={() => setFollowing(!following)}
        className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors',
          following
            ? 'border-primary bg-primary-container text-on-primary-container'
            : 'border-outline text-on-surface-variant hover:border-primary hover:text-primary'
        )}
      >
        {following ? <Check className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
        {following ? 'Following' : 'Follow'}
      </button>
    </li>
  )
}

export function TeamList({ members }: TeamListProps) {
  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">Tim Eduwisata</h2>
      <ul className="space-y-4">
        {members.map((member) => (
          <TeamMemberItem key={member.id} member={member} />
        ))}
      </ul>
      <button className="w-full mt-5 py-3 rounded-xl bg-surface-container-low text-primary text-sm font-bold hover:bg-surface-container transition-colors">
        Lihat Semua
      </button>
    </div>
  )
}
