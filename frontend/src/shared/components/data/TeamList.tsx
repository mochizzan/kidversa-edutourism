import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'

interface TeamMember {
  id: string
  name: string
  role: string
  avatar?: string
}

interface TeamListProps {
  members: TeamMember[]
  onViewAll?: () => void
}

function TeamMemberItem({ member }: { member: TeamMember }) {
  return (
    <li className="flex items-center gap-3 px-3 -mx-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-surface-container-low hover:shadow-sm cursor-default group">
      <div className="w-11 h-11 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm shrink-0 transition-all duration-200 group-hover:scale-110 group-hover:shadow-md">
        {member.avatar ? (
          <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />
        ) : (
          member.name.charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors duration-200">{member.name}</p>
        <p className="text-xs text-on-surface-variant">{member.role}</p>
      </div>
      <div className="w-2 h-2 rounded-full bg-primary/20 group-hover:bg-primary transition-colors duration-200" />
    </li>
  )
}

export function TeamList({ members, onViewAll }: TeamListProps) {
  const navigate = useNavigate()

  if (members.length === 0) return null

  return (
    <div className="bg-surface rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold text-on-surface mb-4">Tim Eduwisata</h2>
      <ul className="space-y-4">
        {members.map((member) => (
          <TeamMemberItem key={member.id} member={member} />
        ))}
      </ul>
      <button
        onClick={() => onViewAll?.() ?? navigate(ROUTES.ADMIN.USERS)}
        className="w-full mt-5 py-3 rounded-xl bg-surface-container-low text-primary text-sm font-bold transition-all duration-200 hover:bg-primary hover:text-on-primary hover:shadow-md active:scale-[0.98]"
      >
        Lihat Semua
      </button>
    </div>
  )
}
