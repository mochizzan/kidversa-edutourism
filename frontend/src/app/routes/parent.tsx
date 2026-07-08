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
    element: <ParentLayout />,
    children: [
      { index: true, element: <Navigate to="/parent/report" replace /> },
      lazyRoute('consent', ParentConsentFormPage),
      lazyRoute('report', ParentReportPage),
      lazyRoute('missions', ParentMissionsPage),
    ],
  },
]
