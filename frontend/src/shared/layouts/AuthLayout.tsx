import { Outlet, Link } from 'react-router-dom'
import { ROUTES } from '../../core/constants/app'

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-dark via-primary to-primary-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to={ROUTES.HOME} className="flex items-center justify-center gap-2 mb-8">
          <img src="/logo.png" alt="Kidversa Logo" className="w-12 h-12 rounded-xl object-contain" />
          <span className="text-3xl font-bold text-white">Kidversa</span>
        </Link>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Outlet />
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-primary-300 text-sm">
          <p>© 2025 Kidversa Edutourism</p>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
