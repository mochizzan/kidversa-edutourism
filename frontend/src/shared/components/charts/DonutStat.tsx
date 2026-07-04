import { useAuth } from '../../../core/hooks/useAuth'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Selamat Pagi'
  if (hour < 17) return 'Selamat Siang'
  return 'Selamat Malam'
}

export function DonutStat() {
  const { user } = useAuth()

  return (
    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-primary to-primary-light p-6 text-white shadow-sm group">
      <div className="relative z-10">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase opacity-80 mb-2">
          EDUTOURISM
        </p>
        <h2 className="text-lg font-bold leading-tight mb-2">
          {getGreeting()}, {user?.name || 'Admin'}!
        </h2>
        <p className="text-xs opacity-90 leading-relaxed">
          Kelola program edutourism Anda dengan mudah. Pantau sesi, peserta, dan laporan dalam satu tempat.
        </p>
      </div>
      <div className="absolute -right-6 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:scale-150 group-hover:opacity-60 group-hover:-translate-x-4 group-hover:-translate-y-4" />
      <div className="absolute -left-10 -top-10 w-24 h-24 bg-white/5 rounded-full blur-3xl transition-all duration-700 group-hover:scale-125" />
    </div>
  )
}
