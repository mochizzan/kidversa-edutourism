import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  FileText,
  Image,
  Users,
  UserRound,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Radio,
  FileCheck,
  Video,
  ClipboardList,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import { useState, useCallback } from 'react'
import { Logo } from '../components/ui/Logo'
import { ROUTES } from '../../core/constants/app'
import { cn } from '../../core/utils'
import { useAuth } from '../../core/hooks/useAuth'
import { AppHeader } from '../components/layout/AppHeader'
import { Tooltip } from '../components/ui/Tooltip'
import { TenantSwitcher } from '../components/ui/TenantSwitcher'
import { ADMIN_ROUTE_ACCESS, RouteAccess } from '../../core/utils/permissions'
import { UserRole } from '../../core/types/enums'
import type { ReactNode } from 'react'

const iconByPath: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  live: <Radio className="w-5 h-5" />,
  programs: <FolderOpen className="w-5 h-5" />,
  sessions: <Calendar className="w-5 h-5" />,
  participants: <UserRound className="w-5 h-5" />,
  reports: <FileCheck className="w-5 h-5" />,
  missions: <ClipboardList className="w-5 h-5" />,
  content: <FileText className="w-5 h-5" />,
  frames: <Image className="w-5 h-5" />,
  recordings: <Video className="w-5 h-5" />,
  tenants: <Building2 className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  consent: <ShieldCheck className="w-5 h-5" />,
}

interface MenuItem {
  label: string
  path: string
  icon: ReactNode
}

const SECTION_ORDER = ['OVERVIEW', 'PROGRAM', 'CONTENT', 'SETTINGS']

function buildMenuSections(userRole: string | undefined): { section: string; items: MenuItem[] }[] {
  if (!userRole) return []
  const bySection = new Map<string, MenuItem[]>()
  ADMIN_ROUTE_ACCESS.forEach((access: RouteAccess) => {
    if (access.roles.includes(userRole as RouteAccess['roles'][number])) {
      const item: MenuItem = {
        label: access.label,
        path: `/admin/${access.path}`,
        icon: iconByPath[access.path],
      }
      const items = bySection.get(access.section) ?? []
      items.push(item)
      bySection.set(access.section, items)
    }
  })
  return SECTION_ORDER.filter((s) => bySection.has(s)).map((section) => ({
    section,
    items: bySection.get(section) ?? [],
  }))
}

const AdminLayout = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  if (location.pathname === '/admin') {
    return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />
  }

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.AUTH.LOGIN, { replace: true })
  }

  const closeDrawer = useCallback(() => setMobileDrawerOpen(false), [])
  const isCollapsed = sidebarCollapsed

  // Filter menu items by user role (derived from ADMIN_ROUTE_ACCESS)
  const visibleSections = buildMenuSections(user?.role)

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile backdrop */}
      {mobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={closeDrawer}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'z-50 h-screen bg-surface-container-low border-r border-outline-variant flex flex-col shrink-0 overflow-hidden',
          'fixed lg:relative',
          'transition-transform duration-300 ease-out lg:transition-[width] lg:duration-200 lg:ease-out',
          'w-64',
          mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full',
          isCollapsed ? 'lg:w-20' : 'lg:w-64',
          'lg:translate-x-0'
        )}
      >
        {/* Logo + Close button */}
        <div className="flex items-center h-16 lg:h-20 px-6 border-b border-outline-variant shrink-0">
          <Link to={ROUTES.HOME} className="flex items-center gap-3 min-w-0 flex-1">
            <Logo className="w-8 h-8 rounded-lg object-contain shrink-0" />
            <span className={cn(
              'text-xl font-bold text-on-surface truncate transition-all duration-200 overflow-hidden whitespace-nowrap',
              isCollapsed ? 'max-w-0 opacity-0' : 'max-w-[200px] opacity-100'
            )}>Kidversa</span>
          </Link>
          <button
            onClick={closeDrawer}
            className="lg:hidden shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors -mr-1"
            aria-label="Tutup sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tenant Switcher for SUPER_ADMIN */}
        {user?.role === UserRole.SUPER_ADMIN && (
          <div className="px-3 py-2 border-b border-outline-variant shrink-0">
            <TenantSwitcher />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {visibleSections.map((section) => (
            <div key={section.section} className={cn(
              'transition-all duration-150',
              isCollapsed ? 'mb-1' : 'mb-6'
            )}>
              <h3
                className={cn(
                  'px-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest transition-all duration-150 overflow-hidden',
                  isCollapsed
                    ? 'max-h-0 opacity-0 mb-0 py-0'
                    : 'max-h-8 opacity-100 mb-2'
                )}
              >
                {section.section}
              </h3>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                  return (
                    <Tooltip key={item.path} content={isCollapsed ? item.label : ''}>
                      <Link
                        to={item.path}
                        onClick={closeDrawer}
                        className={cn(
                          'flex items-center py-3 rounded-xl transition-all duration-200 w-full',
                          isCollapsed ? 'px-[18px]' : 'px-3',
                          isActive
                            ? 'bg-primary-container text-on-primary-container font-medium'
                            : 'text-on-surface-variant hover:bg-surface-container'
                        )}
                      >
                        <span className="flex items-center justify-center shrink-0 w-5 h-5">
                          {item.icon}
                        </span>
                        <span className={cn(
                          'text-sm truncate transition-all duration-200 overflow-hidden whitespace-nowrap',
                          isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
                        )}>{item.label}</span>
                      </Link>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-outline-variant shrink-0">
          <div className="flex flex-col gap-1">
            <Tooltip content={isCollapsed ? 'Perluas Sidebar' : ''}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={cn(
                  'flex items-center py-3 rounded-xl hover:bg-surface-container transition-all duration-200 text-on-surface-variant text-sm w-full hidden lg:flex',
                  isCollapsed ? 'px-[18px]' : 'px-3'
                )}
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="w-5 h-5 shrink-0" />
                ) : (
                  <PanelLeftClose className="w-5 h-5 shrink-0" />
                )}
                <span className={cn(
                  'truncate transition-all duration-200 overflow-hidden whitespace-nowrap',
                  isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
                )}>
                  {isCollapsed ? 'Perluas Sidebar' : 'Tutup Sidebar'}
                </span>
              </button>
            </Tooltip>
            <Tooltip content={isCollapsed ? 'Keluar' : ''}>
              <button
                onClick={handleLogout}
                className={cn(
                  'flex items-center py-3 rounded-xl hover:bg-surface-container transition-all duration-200 text-sm text-on-surface-variant hover:text-on-error-container hover:bg-error-container w-full',
                  isCollapsed ? 'px-[18px]' : 'px-3'
                )}
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span className={cn(
                  'truncate transition-all duration-200 overflow-hidden whitespace-nowrap',
                  isCollapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[200px] opacity-100 ml-3'
                )}>
                  Keluar
                </span>
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader onMenuToggle={() => setMobileDrawerOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 lg:p-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
