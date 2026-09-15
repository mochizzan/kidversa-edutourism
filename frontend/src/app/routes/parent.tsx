import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import ParentLayout from '../../shared/layouts/ParentLayout'
import { RouteGuard } from '../../shared/components/auth/RouteGuard'
import { lazyRoute, SuspenseWrapper } from './helpers'

// Public, unauthenticated parent routes (token in the query string).
const ParentReportAccessPage = lazy(() => import('../../features/parent/pages/ReportPage'))
const ParentConsentFormPage = lazy(() => import('../../features/parent/pages/ConsentFormPage'))
const ParentReportPage = lazy(() => import('../../features/parent/pages/ReportPage'))
const ParentMissionsPage = lazy(() => import('../../features/parent/pages/MissionsPage'))
const ParentGalleryPage = lazy(() => import('../../features/parent/pages/GalleryPage'))

export const parentRoutes: RouteObject[] = [
  // Public parent report view via access token (P1).
  {
    path: '/report/access',
    element: (
      <SuspenseWrapper>
        <ParentReportAccessPage />
      </SuspenseWrapper>
    ),
  },
  // Public gallery view via gallery token (QR code on printed rapor).
  {
    path: '/gallery',
    element: (
      <SuspenseWrapper>
        <ParentGalleryPage />
      </SuspenseWrapper>
    ),
  },
  // Public parent consent response via token (combined consent form).
  {
    path: '/consent/respond',
    element: (
      <SuspenseWrapper>
        <ParentConsentFormPage />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/parent',
    element: <RouteGuard public />,
    children: [
      { index: true, element: <Navigate to="/parent/report" replace /> },
      lazyRoute('report', ParentReportPage),
      {
        element: <ParentLayout />,
        children: [
          lazyRoute('missions', ParentMissionsPage),
        ],
      },
    ],
  },
]
