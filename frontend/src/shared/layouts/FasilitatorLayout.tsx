import { Outlet, Link, useLocation } from 'react-router-dom'
import { cn } from '../../core/utils'
import { useAuth } from '../../core/hooks/useAuth'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import { ROUTES } from '../../core/constants/app'
import { Logo } from '../components/ui/Logo'
import {
  LayoutDashboard,
  Users,
  Camera,
  User,
  Cloud,
} from 'lucide-react'


const navItems = [
  {
    label: 'Dashboard',
    path: ROUTES.FASILITATOR.DASHBOARD,
    icon: LayoutDashboard,
  },
  {
    label: 'Groups',
    path: ROUTES.FASILITATOR.GROUPS,
    icon: Users,
  },
  {
    label: 'Camera',
    path: ROUTES.FASILITATOR.CAMERA,
    icon: Camera,
  },
  {
    label: 'Profile',
    path: ROUTES.FASILITATOR.PROFILE,
    icon: User,
  },
] as const

const FasilitatorLayout = () => {
  const location = useLocation()
  const { user } = useAuth()

  const userName = user?.name?.split(' ')[0] || 'Fasilitator'

  return (
    <div className="min-h-screen bg-surface-container-low flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-[#ECECEC] px-4 md:px-6 lg:px-8 h-16 md:h-[72px] lg:h-[75px] flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Brand Logo — image from assets */}
          <Logo className="w-9 h-9 md:w-10 md:h-10 rounded-lg object-contain shrink-0 shadow-sm" />
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-[#1C1B1F] leading-tight truncate">
              Hai, {userName}
            </h1>
            <p className="text-[10px] md:text-[11px] text-[#49454F] font-normal leading-tight">
              Fasilitator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Cloud Status — green pill */}
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1.5 text-xs font-semibold text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
            <Cloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cloud</span>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-y-auto lg:overflow-visible pb-[88px]">
        <div className="px-4 py-5 md:px-6 md:py-7 lg:px-8 lg:py-8 max-w-[1128px] mx-auto w-full">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* ── Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E6E0E9] z-50 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(item.path + '/')

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5',
                  'min-w-[80px] min-h-[64px] py-2 px-3',
                  'transition-colors duration-200',
                  isActive
                    ? 'text-[#5B2C8D]'
                    : 'text-[#CAC4D0] hover:text-[#49454F]'
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#5B2C8D] rounded-full" />
                )}

                <Icon
                  className={cn(
                    'w-6 h-6',
                    isActive ? 'text-[#5B2C8D]' : ''
                  )}
                />

                <span
                  className={cn(
                    'text-[10px] font-medium leading-tight',
                    isActive
                      ? 'text-[#5B2C8D] font-bold'
                      : 'text-[#CAC4D0]'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default FasilitatorLayout
