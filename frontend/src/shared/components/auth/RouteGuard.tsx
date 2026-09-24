import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { i18n } from '../../../core/i18n'
import { useAuth } from '../../../core/hooks/useAuth'
import { useAuthStore } from '../../../core/stores/authStore'
import { getRouteAccess, type RouteAccess } from '../../../core/utils/permissions'
import { TenantGuard } from './TenantGuard'
import { ROUTES } from '../../../core/constants/app'

interface RouteGuardProps {
 /** Admin segment key → looked up in ROUTE_ACCESS (drives roles + tenant wrap). */
 segment?: string
 /** Explicit role allow-list; if absent, `segment` must resolve to roles. */
 allowedRoles?: RouteAccess['roles']
 /** Public token-scoped routes (parent/learner): skip session auth entirely;
  *  access is enforced per-page via the token in the query string. */
 public?: boolean
 children?: React.ReactNode
}

// Unified route guard. Collapses the old segment-based `RouteGuard` (admin) and
// the inline-allowedRoles `ProtectedRoute` (fasilitator) into one component.
//
// - `allowedRoles` (fasilitator-style): gate purely on role; unauthenticated →
//   login with returnUrl; wrong role → "/". No tenant scoping.
// - `segment` (admin-style): resolves roles + tenantFree from ROUTE_ACCESS;
//   unauthenticated → login; wrong role → role-specific redirect; non-tenantFree
//   segments are additionally wrapped in TenantGuard.
// - `public`: token-scoped routes (parent report/consent, learner kiosk) are
//   reachable without a session; the page validates the token itself.
const LoadingSpinner = () => (
 <div className="min-h-screen flex items-center justify-center bg-gray-50">
  <div className="text-center">
   <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
   <p className="mt-4 text-gray-600">{i18n.t('common.loading')}</p>
  </div>
 </div>
)

export function RouteGuard({ segment, allowedRoles, public: isPublic, children }: RouteGuardProps) {
 const { user, isAuthenticated, isLoading } = useAuth()
 const getRedirectPath = useAuthStore((s) => s.getRedirectPath)
 const location = useLocation()

 const access = segment ? getRouteAccess(segment) : undefined
 const roles = allowedRoles ?? access?.roles

 if (isPublic) {
  return children ? <>{children}</> : <Outlet />
 }

 if (isLoading) {
  return <LoadingSpinner />
 }

 if (!isAuthenticated) {
  return (
   <Navigate to={`${ROUTES.AUTH.LOGIN}?returnUrl=${encodeURIComponent(location.pathname)}`} replace />
  )
 }

 // Force password change for bootstrap/demo accounts before any other route.
 if (user?.must_change_password && location.pathname !== ROUTES.AUTH.CHANGE_PASSWORD) {
  return <Navigate to={ROUTES.AUTH.CHANGE_PASSWORD} replace />
 }

 if (!roles || (user && !roles.includes(user.role))) {
  // Admin (segment) redirects to its role landing; fasilitator (allowedRoles)
  // historically redirected to "/".
  return <Navigate to={segment ? getRedirectPath() : '/'} replace />
 }

 // Only segment-driven (admin) routes scope by active tenant.
 if (!segment || access?.tenantFree) {
  return children ? <>{children}</> : <Outlet />
 }

 return <TenantGuard>{children ? <>{children}</> : <Outlet />}</TenantGuard>
}
