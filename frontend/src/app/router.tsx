import { createBrowserRouter, Navigate } from 'react-router-dom'
import AdminLayout from '../shared/layouts/AdminLayout'
import AuthLayout from '../shared/layouts/AuthLayout'
import FasilitatorLayout from '../shared/layouts/FasilitatorLayout'
import ParentLayout from '../shared/layouts/ParentLayout'
import ProtectedRoute from '../shared/components/auth/ProtectedRoute'
import { UserRole } from '../core/types/enums'
import { lazy, Suspense } from 'react'

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
  </div>
)

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
)

import LoginPage from '../features/auth/pages/LoginPage'
import RegisterPage from '../features/auth/pages/RegisterPage'
import ProgramsPage from '../features/admin/pages/ProgramsPage'
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

// ── Admin pages (lazy) ──
const AdminDashboardPage = lazy(() => import('../features/admin/pages/DashboardPage'))
const ProgramDetailPage = lazy(() => import('../features/admin/pages/ProgramDetailPage'))
const SessionsPage = lazy(() => import('../features/admin/pages/SessionsPage'))
const SessionDetailPage = lazy(() => import('../features/admin/pages/SessionDetailPage'))
const ContentPage = lazy(() => import('../features/admin/pages/ContentPage'))
const FramesPage = lazy(() => import('../features/admin/pages/FramesPage'))
const FrameUploadPage = lazy(() => import('../features/admin/pages/FrameUploadPage'))
const UsersPage = lazy(() => import('../features/admin/pages/UsersPage'))
const LiveMonitorPage = lazy(() => import('../features/admin/pages/LiveMonitorPage'))
const ReportListPage = lazy(() => import('../features/admin/pages/ReportListPage'))
const ReportSessionPage = lazy(() => import('../features/admin/pages/ReportSessionPage'))
const ReportReviewPage = lazy(() => import('../features/admin/pages/ReportReviewPage'))
const MissionBankPage = lazy(() => import('../features/admin/pages/MissionBankPage'))
const RecordingReviewPage = lazy(() => import('../features/admin/pages/RecordingReviewPage'))
const RecordingDetailPage = lazy(() => import('../features/admin/pages/RecordingDetailPage'))
const ConsentMonitorPage = lazy(() => import('../features/admin/pages/ConsentMonitorPage'))

// ── Fasilitator pages (lazy) ──
const FasilitatorDashboardPage = lazy(() => import('../features/fasilitator/pages/DashboardPage'))
const FasilitatorActivitiesPage = lazy(() => import('../features/fasilitator/pages/ActivitiesPage'))
const FasilitatorGroupsPage = lazy(() => import('../features/fasilitator/pages/GroupsPage'))
const FasilitatorGroupPage = lazy(() => import('../features/fasilitator/pages/GroupPage'))
const FasilitatorChildAssessmentPage = lazy(() => import('../features/fasilitator/pages/ChildAssessmentPage'))
const FasilitatorCameraPage = lazy(() => import('../features/fasilitator/pages/CameraPage'))
const FasilitatorSmartPhotoPage = lazy(() => import('../features/fasilitator/pages/SmartPhotoPage'))
const FasilitatorRecordingPage = lazy(() => import('../features/fasilitator/pages/RecordingPage'))
const FasilitatorProfilePage = lazy(() => import('../features/fasilitator/pages/ProfilePage'))

// ── Parent pages (lazy, token-based) ──
const ParentConsentFormPage = lazy(() => import('../features/parent/pages/ConsentFormPage'))
const ParentReportPage = lazy(() => import('../features/parent/pages/ReportPage'))
const ParentMissionsPage = lazy(() => import('../features/parent/pages/MissionsPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/auth/login" replace />,
  },
  // ── Auth routes ──
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/auth/login" replace />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
    ],
  },
  // ── Admin routes (SUPER_ADMIN, ADMIN_WISATA, KOORDINATOR) ──
  {
    element: (
      <ProtectedRoute
        allowedRoles={[UserRole.SUPER_ADMIN, UserRole.ADMIN_WISATA, UserRole.KOORDINATOR]}
      />
    ),
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/admin/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: (
              <SuspenseWrapper>
                <AdminDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'live',
            element: (
              <SuspenseWrapper>
                <LiveMonitorPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'live/:sessionId',
            element: (
              <SuspenseWrapper>
                <LiveMonitorPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'programs',
            element: <ProgramsPage />,
          },
          {
            path: 'programs/:programId',
            element: (
              <SuspenseWrapper>
                <ProgramDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'sessions',
            element: (
              <SuspenseWrapper>
                <SessionsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'sessions/:sessionId',
            element: (
              <SuspenseWrapper>
                <SessionDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'content',
            element: (
              <SuspenseWrapper>
                <ContentPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'frames/upload',
            element: (
              <SuspenseWrapper>
                <FrameUploadPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'frames',
            element: (
              <SuspenseWrapper>
                <FramesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'users',
            element: (
              <SuspenseWrapper>
                <UsersPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'reports',
            element: (
              <SuspenseWrapper>
                <ReportListPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'reports/:sessionId',
            element: (
              <SuspenseWrapper>
                <ReportSessionPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'reports/:sessionId/review/:reportId',
            element: (
              <SuspenseWrapper>
                <ReportReviewPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'missions',
            element: (
              <SuspenseWrapper>
                <MissionBankPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'recordings',
            element: (
              <SuspenseWrapper>
                <RecordingReviewPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'recordings/:recordingId',
            element: (
              <SuspenseWrapper>
                <RecordingDetailPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'consent',
            element: (
              <SuspenseWrapper>
                <ConsentMonitorPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
  // ── Fasilitator routes (mobile-first with FasilitatorLayout) ──
  {
    element: <ProtectedRoute allowedRoles={[UserRole.FASILITATOR]} />,
    children: [
      {
        path: '/fasilitator',
        element: <FasilitatorLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/fasilitator/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: (
              <SuspenseWrapper>
                <FasilitatorDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'activities',
            element: (
              <SuspenseWrapper>
                <FasilitatorActivitiesPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'groups',
            element: (
              <SuspenseWrapper>
                <FasilitatorGroupsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'camera',
            element: (
              <SuspenseWrapper>
                <FasilitatorCameraPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'profile',
            element: (
              <SuspenseWrapper>
                <FasilitatorProfilePage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'groups/:groupId',
            element: (
              <SuspenseWrapper>
                <FasilitatorGroupPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'groups/:groupId/children/:childId',
            element: (
              <SuspenseWrapper>
                <FasilitatorChildAssessmentPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'groups/:groupId/children/:childId/photo',
            element: (
              <SuspenseWrapper>
                <FasilitatorSmartPhotoPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'groups/:groupId/children/:childId/record',
            element: (
              <SuspenseWrapper>
                <FasilitatorRecordingPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
  // ── Parent routes (public, token-based access) ──
  {
    path: '/parent',
    element: <ParentLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/parent/report" replace />,
      },
      {
        path: 'consent',
        element: (
          <SuspenseWrapper>
            <ParentConsentFormPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'report',
        element: (
          <SuspenseWrapper>
            <ParentReportPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'missions',
        element: (
          <SuspenseWrapper>
            <ParentMissionsPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
  // ── 404 ──
  {
    path: '*',
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
])
