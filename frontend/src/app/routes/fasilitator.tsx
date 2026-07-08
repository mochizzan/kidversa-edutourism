import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import FasilitatorLayout from '../../shared/layouts/FasilitatorLayout'
import ProtectedRoute from '../../shared/components/auth/ProtectedRoute'
import { UserRole } from '../../core/types/enums'
import { lazyRoute } from './helpers'

const FasilitatorDashboardPage = lazy(() => import('../../features/fasilitator/pages/DashboardPage'))
const FasilitatorActivitiesPage = lazy(() => import('../../features/fasilitator/pages/ActivitiesPage'))
const FasilitatorGroupsPage = lazy(() => import('../../features/fasilitator/pages/GroupsPage'))
const FasilitatorGroupPage = lazy(() => import('../../features/fasilitator/pages/GroupPage'))
const FasilitatorChildAssessmentPage = lazy(() => import('../../features/fasilitator/pages/ChildAssessmentPage'))
const FasilitatorCameraPage = lazy(() => import('../../features/fasilitator/pages/CameraPage'))
const FasilitatorSmartPhotoPage = lazy(() => import('../../features/fasilitator/pages/SmartPhotoPage'))
const FasilitatorRecordingPage = lazy(() => import('../../features/fasilitator/pages/RecordingPage'))
const FasilitatorProfilePage = lazy(() => import('../../features/fasilitator/pages/ProfilePage'))

export const fasilitatorRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute allowedRoles={[UserRole.FASILITATOR]} />,
    children: [
      {
        path: '/fasilitator',
        element: <FasilitatorLayout />,
        children: [
          { index: true, element: <Navigate to="/fasilitator/dashboard" replace /> },
          lazyRoute('dashboard', FasilitatorDashboardPage),
          lazyRoute('activities', FasilitatorActivitiesPage),
          lazyRoute('groups', FasilitatorGroupsPage),
          lazyRoute('groups/:groupId', FasilitatorGroupPage),
          lazyRoute('groups/:groupId/children/:childId', FasilitatorChildAssessmentPage),
          lazyRoute('groups/:groupId/children/:childId/photo', FasilitatorSmartPhotoPage),
          lazyRoute('groups/:groupId/children/:childId/record', FasilitatorRecordingPage),
          lazyRoute('camera', FasilitatorCameraPage),
          lazyRoute('profile', FasilitatorProfilePage),
        ],
      },
    ],
  },
]
