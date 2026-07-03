import { Outlet, Link, useLocation } from 'react-router-dom'
import { 
  Globe, 
  LayoutDashboard, 
  BookOpen, 
  Activity, 
  Users,
  LogOut,
  Menu,
  X
} from 'lucide-react'
import { useState } from 'react'
import { ROUTES } from '../../core/constants/app'
import { cn } from '../../core/utils'

interface SidebarItem {
  label: string
  path: string
  icon: React.ReactNode
}

// Menu items based on role (determined by path)
const getMenuItems = (pathname: string): SidebarItem[] => {
  if (pathname.startsWith('/admin')) {
    return [
      { label: 'Dashboard', path: '/admin/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
      { label: 'Stories', path: '/admin/stories', icon: <BookOpen className="w-5 h-5" /> },
      { label: 'Users', path: '/admin/users', icon: <Users className="w-5 h-5" /> },
    ]
  }
  if (pathname.startsWith('/fasilitator')) {
    return [
      { label: 'Dashboard', path: '/fasilitator/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
      { label: 'Activities', path: '/fasilitator/activities', icon: <Activity className="w-5 h-5" /> },
    ]
  }
  if (pathname.startsWith('/parent')) {
    return [
      { label: 'Dashboard', path: '/parent/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
      { label: 'Stories', path: '/parent/stories', icon: <BookOpen className="w-5 h-5" /> },
    ]
  }
  return []
}

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const location = useLocation()
  const menuItems = getMenuItems(location.pathname)

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-purple-900 text-white p-4">
        <div className="flex items-center justify-between">
          <Link to={ROUTES.HOME} className="flex items-center gap-2">
            <Globe className="w-6 h-6 text-amber-400" />
            <span className="text-xl font-bold">Kidversa</span>
          </Link>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 bg-purple-900 text-white transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-purple-700">
          <Link to={ROUTES.HOME} className="flex items-center gap-2">
            <Globe className="w-8 h-8 text-amber-400" />
            <span className="text-2xl font-bold">Kidversa</span>
          </Link>
        </div>

        {/* Menu */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                location.pathname === item.path
                  ? 'bg-amber-400 text-purple-900'
                  : 'hover:bg-purple-800'
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-purple-700">
          <button className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-purple-800 rounded-lg transition-colors">
            <LogOut className="w-5 h-5" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn('lg:ml-64 min-h-screen', sidebarOpen ? 'pt-16 lg:pt-0' : 'pt-0')}>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
