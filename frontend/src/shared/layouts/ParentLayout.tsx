import { Outlet, Link } from 'react-router-dom'
import { ErrorBoundary } from '../components/feedback/ErrorBoundary'

const ParentLayout = () => {
  return (
    <div className="min-h-screen bg-surface-container-low">
      {/* Header */}
      <header className="bg-white border-b border-outline-variant sticky top-0 z-30">
        <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/parent/dashboard" className="flex items-center gap-3">
            <img src="/logo.png" alt="Kidversa Logo" className="w-8 h-8 rounded-lg object-contain" />
            <div>
              <h1 className="text-base font-bold text-on-surface leading-tight">Kidversa</h1>
              <p className="text-[10px] text-on-surface-variant leading-tight">Orang Tua</p>
            </div>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[480px] mx-auto px-4 py-6">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="max-w-[480px] mx-auto px-4 py-6 text-center">
        <p className="text-xs text-on-surface-variant">
          &copy; 2026 Kidversa Edutourism
        </p>
      </footer>
    </div>
  )
}

export default ParentLayout
