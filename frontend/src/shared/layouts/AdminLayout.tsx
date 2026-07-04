import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  FileText,
  Image,
  Users,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useState } from 'react'
import { ROUTES } from '../../core/constants/app'
import { cn } from '../../core/utils'
import { useAuth } from '../../core/hooks/useAuth'
import { AppHeader } from '../components/layout/AppHeader'
import { Tooltip } from '../components/ui/Tooltip'

const menuSections = [
  {
    section: 'OVERVIEW',
    items: [
      { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    ],
  },
  {
    section: 'PROGRAM',
    items: [
      { label: 'Programs', path: '/admin/programs', icon: <FolderOpen className="w-5 h-5" /> },
      { label: 'Sessions', path: '/admin/sessions', icon: <Calendar className="w-5 h-5" /> },
    ],
  },
  {
    section: 'CONTENT',
    items: [
      { label: 'Content Manager', path: '/admin/content', icon: <FileText className="w-5 h-5" /> },
      { label: 'Frame Manager', path: '/admin/frames', icon: <Image className="w-5 h-5" /> },
    ],
  },
  {
    section: 'SETTINGS',
    items: [
      { label: 'Users', path: '/admin/users', icon: <Users className="w-5 h-5" /> },
    ],
  },
]

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { logout } = useAuth()

  if (location.pathname === '/admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'z-50 h-screen bg-surface-container-low border-r border-outline-variant flex flex-col transition-all duration-300 shrink-0',
          'fixed lg:relative',
          sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-20'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-outline-variant">
          <Link to={ROUTES.HOME} className="flex items-center gap-3">
            <img src="/logo.png" alt="Kidversa Logo" className="w-8 h-8 rounded-lg object-contain shrink-0" />
            {sidebarOpen && <span className="text-xl font-bold text-on-surface">Kidversa</span>}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.section}>
              {sidebarOpen && (
                <h3 className="px-4 mb-2 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  {section.section}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                  const linkEl = (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                        isActive
                          ? 'bg-primary-container text-on-primary-container font-medium'
                          : 'text-on-surface-variant hover:bg-surface-container',
                        !sidebarOpen && 'justify-center'
                      )}
                    >
                      {item.icon}
                      {sidebarOpen && <span className="text-sm">{item.label}</span>}
                    </Link>
                  )
                  return !sidebarOpen ? (
                    <Tooltip key={item.path} content={item.label}>
                      {linkEl}
                    </Tooltip>
                  ) : linkEl
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant space-y-2">
          {/* Desktop toggle — lg+ only */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-surface-container rounded-xl transition-colors text-on-surface-variant text-sm"
          >
            {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            {sidebarOpen && <span>Tutup Sidebar</span>}
          </button>
          {/* Logout */}
          {!sidebarOpen ? (
            <Tooltip content="Keluar">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-error-container rounded-xl transition-colors text-on-surface-variant hover:text-on-error-container justify-center"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-error-container rounded-xl transition-colors text-sm text-on-surface-variant hover:text-on-error-container"
            >
              <LogOut className="w-5 h-5" />
              <span>Keluar</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
