import type { LucideIcon } from 'lucide-react'
import { cn } from '../../../core/utils'

interface CircleControlBtnProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  active?: boolean
}

export const CircleControlBtn = ({ icon: Icon, label, onClick, active }: CircleControlBtnProps) => (
  <button onClick={onClick} className="flex flex-col items-center gap-0.5 group">
    <div
      className={cn(
        'w-12 h-12 rounded-full backdrop-blur-md border flex items-center justify-center group-active:scale-95 transition-all shadow-lg',
        active
          ? 'bg-white/90 border-primary/40 text-primary'
          : 'bg-camera-overlay border-outline-camera text-white group-hover:bg-black/60',
      )}
    >
      <Icon className="w-5 h-5" />
    </div>
    <span
      className={cn(
        'text-[10px] font-extrabold tracking-wider uppercase leading-none drop-shadow-sm',
        active ? 'text-white' : 'text-white/80',
      )}
    >
      {label}
    </span>
  </button>
)
