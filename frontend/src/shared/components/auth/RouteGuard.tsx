import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../core/hooks/useAuth'
import { useAuthStore } from '../../../core/stores/authStore'
import { getRouteAccess } from '../../../core/utils/permissions'
import { TenantGuard } from './TenantGuard'
import { ROUTES } from '../../../core/constants/app'

interface RouteGuardProps {
  segment: string
  children: React.ReactNode
}

export function RouteGuard({ segment, children }: RouteGuardProps) {
  const { user, isAuthenticated } = useAuth()
  const getRedirectPath = useAuthStore((s) => s.getRedirectPath)
  const location = useLocation()
  const access = getRouteAccess(segment)

  if (!isAuthenticated) {
    return <Navigate to={`${ROUTES.AUTH.LOGIN}?returnUrl=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (!access) {
    return <Navigate to={ROUTES.ADMIN.DASHBOARD} replace />
  }

  if (!user || !access.roles.includes(user.role)) {
    return <Navigate to={getRedirectPath()} replace />
  }

  if (access.tenantFree) {
    return <>{children}</>
  }

  return <TenantGuard>{children}</TenantGuard>
}
