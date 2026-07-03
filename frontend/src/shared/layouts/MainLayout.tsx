import { Outlet } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../core/constants/app'

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-600">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to={ROUTES.HOME} className="flex items-center gap-2 text-white">
            <Globe className="w-8 h-8 text-amber-400" />
            <span className="text-2xl font-bold">Kidversa</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to={ROUTES.AUTH}
              className="text-white hover:text-amber-400 transition-colors"
            >
              Masuk
            </Link>
            <Link
              to={`${ROUTES.AUTH}?mode=register`}
              className="bg-amber-400 text-purple-900 px-4 py-2 rounded-lg font-semibold hover:bg-amber-300 transition-colors"
            >
              Daftar
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 mt-16">
        <div className="text-center text-purple-300 text-sm">
          <p>© 2025 Kidversa Edutourism. Built with ❤️</p>
        </div>
      </footer>
    </div>
  )
}

export default MainLayout
