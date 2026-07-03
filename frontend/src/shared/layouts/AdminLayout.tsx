import { Outlet, Link, useLocation, Navigate, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  Calendar,
  FileText,
  Image,
  Users,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { ROUTES } from '../../core/constants/app'
import { cn } from '../../core/utils'
import { useAuth } from '../../core/hooks/useAuth'
import { UserRole } from '../../core/types'

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

// Role display labels
const ROLE_LABELS: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN_WISATA]: 'Admin Wisata',
  [UserRole.KOORDINATOR]: 'Koordinator',
  [UserRole.FASILITATOR]: 'Fasilitator',
  [UserRole.PARENT]: 'Orang Tua',
}

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  if (location.pathname === '/admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  const handleLogout = async () => {
    await logout()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-4 px-4 h-14 bg-primary text-white shadow-md">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1 rounded-lg hover:bg-primary-light transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Link to={ROUTES.HOME} className="flex items-center gap-3">
          <img src="/logo.png" alt="Kidversa Logo" className="w-8 h-8 rounded-lg object-contain shrink-0" />
          <span className="text-xl font-bold">Kidversa</span>
        </Link>
      </div>

      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex">
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 h-screen bg-primary text-white transition-all duration-300',
            sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-20'
          )}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b border-primary-light">
              <Link to={ROUTES.HOME} className="flex items-center gap-3">
                <img src="/logo.png" alt="Kidversa Logo" className="w-8 h-8 rounded-lg object-contain shrink-0" />
                {sidebarOpen && <span className="text-xl font-bold">Kidversa</span>}
              </Link>
            </div>

            {/* User Info (when sidebar expanded) */}
            {sidebarOpen && user && (
              <div className="px-4 py-4 border-b border-primary-light">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center shrink-0">
                    <span className="text-primary-dark font-bold text-lg">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-white/60 truncate">
                      {ROLE_LABELS[user.role] || user.role}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
              {menuSections.map((section) => (
                <div key={section.section}>
                  {sidebarOpen && (
                    <h3 className="px-4 mb-2 text-xs font-semibold text-white/50 uppercase tracking-wider">
                      {section.section}
                    </h3>
                  )}
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setSidebarOpen(false)}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                            isActive ? 'bg-accent text-primary-dark font-medium' : 'hover:bg-primary-light text-white/90',
                            !sidebarOpen && 'justify-center'
                          )}
                          title={!sidebarOpen ? item.label : undefined}
                        >
                          {item.icon}
                          {sidebarOpen && <span>{item.label}</span>}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-primary-light space-y-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-primary-light rounded-lg transition-colors text-sm text-white/80"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                {sidebarOpen && <span>Collapse</span>}
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-red-500/20 rounded-lg transition-colors text-sm text-white/80 hover:text-red-300"
              >
                <LogOut className="w-5 h-5" />
                {sidebarOpen && <span>Keluar</span>}
              </button>
            </div>
          </div>
        </aside>

        <div
          className={cn(
            'flex-1 min-h-screen transition-all duration-300',
            'pt-14 lg:pt-0',
            sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
          )}
        >
          <main className="p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout
