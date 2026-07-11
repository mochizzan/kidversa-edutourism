import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import ParentLayout from '../../shared/layouts/ParentLayout'
import { lazyRoute } from './helpers'

const ParentConsentFormPage = lazy(() => import('../../features/parent/pages/ConsentFormPage'))
const ParentReportPage = lazy(() => import('../../features/parent/pages/ReportPage'))
const ParentMissionsPage = lazy(() => import('../../features/parent/pages/MissionsPage'))

export const parentRoutes: RouteObject[] = [
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
