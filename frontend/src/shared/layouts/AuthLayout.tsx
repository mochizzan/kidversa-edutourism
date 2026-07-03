import { Outlet, Link } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { ROUTES } from '../../core/constants/app'

const AuthLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-purple-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to={ROUTES.HOME} className="flex items-center justify-center gap-2 mb-8">
          <Globe className="w-10 h-10 text-amber-400" />
          <span className="text-3xl font-bold text-white">Kidversa</span>
        </Link>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Outlet />
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-purple-300 text-sm">
          <p>© 2025 Kidversa Edutourism</p>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
