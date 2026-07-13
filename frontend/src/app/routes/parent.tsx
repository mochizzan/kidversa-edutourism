import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import ParentLayout from '../../shared/layouts/ParentLayout'
import { lazyRoute, SuspenseWrapper } from './helpers'

// Public, unauthenticated parent routes (token in the query string).
const ParentReportAccessPage = lazy(() => import('../../features/parent/pages/ReportPage'))
const ParentConsentRespondPage = lazy(() => import('../../features/parent/pages/ConsentFormPage'))
const ParentConsentFormPage = lazy(() => import('../../features/parent/pages/ConsentFormPage'))
const ParentReportPage = lazy(() => import('../../features/parent/pages/ReportPage'))
const ParentMissionsPage = lazy(() => import('../../features/parent/pages/MissionsPage'))

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
  // Public parent consent response via token (P2).
  {
    path: '/consent/respond',
    element: (
      <SuspenseWrapper>
        <ParentConsentRespondPage />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/parent',
    children: [
      { index: true, element: <Navigate to="/parent/report" replace /> },
      lazyRoute('report', ParentReportPage),
      {
        element: <ParentLayout />,
        children: [
          lazyRoute('consent', ParentConsentFormPage),
          lazyRoute('missions', ParentMissionsPage),
        ],
      },
    ],
  },
]
