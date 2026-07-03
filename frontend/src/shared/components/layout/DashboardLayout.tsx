import { useState, useEffect, type ReactNode } from 'react'
import { LayoutGrid, PanelLeft } from 'lucide-react'
import { cn } from '../../../core/utils'

interface DashboardLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  defaultMode?: 'full' | 'sidebar'
}

const STORAGE_KEY = 'kidversa-dashboard-layout'

export function DashboardLayout({
  children,
  sidebar,
  defaultMode = 'full',
}: DashboardLayoutProps) {
  const [mode, setMode] = useState<'full' | 'sidebar'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'full' || saved === 'sidebar') return saved
    } catch {
      // ignore
    }
    return defaultMode
  })

  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore
    }
  }, [mode])

  return (
    <div>
      {/* Layout Toggle */}
      {sidebar && (
        <div className="flex items-center gap-1 mb-4">
          <button
            onClick={() => setMode('full')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              mode === 'full'
                ? 'bg-primary-100 text-primary'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Full Width</span>
          </button>
          <button
            onClick={() => {
              setMode('sidebar')
              setSidebarOpen(true)
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
              mode === 'sidebar'
                ? 'bg-primary-100 text-primary'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            <PanelLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Sidebar</span>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div
        className={cn(
          'grid gap-6',
          mode === 'sidebar' && sidebar && sidebarOpen
            ? 'grid-cols-1 lg:grid-cols-3'
            : 'grid-cols-1'
        )}
      >
        {/* Main Content */}
        <div
          className={cn(
            'min-w-0',
            mode === 'sidebar' && sidebar && sidebarOpen ? 'lg:col-span-2' : ''
          )}
        >
          {children}
        </div>

        {/* Sidebar */}
        {sidebar && mode === 'sidebar' && sidebarOpen && (
          <div className="lg:col-span-1">
            <div className="sticky top-6">{sidebar}</div>
          </div>
        )}
      </div>
    </div>
  )
}
