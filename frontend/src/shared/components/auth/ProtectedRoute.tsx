import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../../core/hooks/useAuth'
import type { UserRole } from '../../../core/types'
import { ROUTES } from '../../../core/constants/app'

interface ProtectedRouteProps {
  children?: React.ReactNode
  allowedRoles?: UserRole[]
}

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
      <p className="mt-4 text-gray-600">Memuat...</p>
    </div>
  </div>
)

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  // Show loading while checking session
  if (isLoading) {
    return <LoadingSpinner />
  }

  // Not authenticated → redirect to login with returnUrl
  if (!isAuthenticated) {
    return (
      <Navigate
        to={`${ROUTES.AUTH.LOGIN}?returnUrl=${encodeURIComponent(location.pathname)}`}
        replace
      />
    )
  }

  // Role-based access control
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <Navigate
        to="/"
        replace
      />
    )
  }

  // Authorized → render children or outlet
  return children ? <>{children}</> : <Outlet />
}

export default ProtectedRoute
