import { Outlet, Link } from 'react-router-dom'
import { ROUTES } from '../../core/constants/app'

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light">
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to={ROUTES.HOME} className="flex items-center gap-2 text-white">
            <img src="/logo.png" alt="Kidversa Logo" className="w-10 h-10 rounded-lg object-contain" />
            <span className="text-2xl font-bold">Kidversa</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to={ROUTES.AUTH}
              className="text-white hover:text-accent transition-colors"
            >
              Masuk
            </Link>
            <Link
              to={`${ROUTES.AUTH}?mode=register`}
              className="bg-accent text-primary-dark px-4 py-2 rounded-lg font-semibold hover:bg-accent-light transition-colors"
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
        <div className="text-center text-primary-300 text-sm">
          <p>© 2025 Kidversa Edutourism. Built with ❤️</p>
        </div>
      </footer>
    </div>
  )
}

export default MainLayout
