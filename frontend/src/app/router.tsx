import { createBrowserRouter, Navigate } from 'react-router-dom'
import AdminLayout from '../shared/layouts/AdminLayout'
import MainLayout from '../shared/layouts/MainLayout'
import AuthLayout from '../shared/layouts/AuthLayout'
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

const AdminDashboardPage = lazy(() => import('../features/admin/pages/DashboardPage'))
const ProgramDetailPage = lazy(() => import('../features/admin/pages/ProgramDetailPage'))
const SessionsPage = lazy(() => import('../features/admin/pages/SessionsPage'))
const SessionDetailPage = lazy(() => import('../features/admin/pages/SessionDetailPage'))
const ContentPage = lazy(() => import('../features/admin/pages/ContentPage'))
const FramesPage = lazy(() => import('../features/admin/pages/FramesPage'))
const FrameUploadPage = lazy(() => import('../features/admin/pages/FrameUploadPage'))
const UsersPage = lazy(() => import('../features/admin/pages/UsersPage'))

const FasilitatorDashboardPage = lazy(() => import('../features/fasilitator/pages/DashboardPage'))
const FasilitatorActivitiesPage = lazy(() => import('../features/fasilitator/pages/ActivitiesPage'))
const ParentDashboardPage = lazy(() => import('../features/parent/pages/DashboardPage'))
const ParentStoriesPage = lazy(() => import('../features/parent/pages/StoriesPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/auth/login" replace />,
  },
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
    element: <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.ADMIN_WISATA, UserRole.KOORDINATOR]} />,
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
        ],
      },
    ],
  },
  // ── Fasilitator routes ──
  {
    element: <ProtectedRoute allowedRoles={[UserRole.FASILITATOR]} />,
    children: [
      {
        path: '/fasilitator',
        element: <AdminLayout />,
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
        ],
      },
    ],
  },
  // ── Parent routes ──
  {
    element: <ProtectedRoute allowedRoles={[UserRole.PARENT]} />,
    children: [
      {
        path: '/parent',
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/parent/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: (
              <SuspenseWrapper>
                <ParentDashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'stories',
            element: (
              <SuspenseWrapper>
                <ParentStoriesPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
])
