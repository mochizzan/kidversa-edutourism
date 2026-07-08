import { Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RouteGuard } from '../../shared/components/auth/RouteGuard'

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
  </div>
)

export const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
)

/** Route with RouteGuard + Suspense — for admin segment-based routes */
export function guardedRoute(
  path: string,
  segment: string,
  Component: React.LazyExoticComponent<React.ComponentType>,
): RouteObject {
  return {
    path,
    element: (
      <RouteGuard segment={segment}>
        <SuspenseWrapper>
          <Component />
        </SuspenseWrapper>
      </RouteGuard>
    ),
  }
}

/** Route with Suspense only — no guard */
export function lazyRoute(
  path: string,
  Component: React.LazyExoticComponent<React.ComponentType>,
): RouteObject {
  return {
    path,
    element: (
      <SuspenseWrapper>
        <Component />
      </SuspenseWrapper>
    ),
  }
}
