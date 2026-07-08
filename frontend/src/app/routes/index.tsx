import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import { SuspenseWrapper } from './helpers'

const NotFoundPage = lazy(() => import('../../pages/NotFoundPage'))

export const rootRoute: RouteObject = {
  path: '/',
  element: <Navigate to="/auth/login" replace />,
}

export const notFoundRoute: RouteObject = {
  path: '*',
  element: (
    <SuspenseWrapper>
      <NotFoundPage />
    </SuspenseWrapper>
  ),
}
