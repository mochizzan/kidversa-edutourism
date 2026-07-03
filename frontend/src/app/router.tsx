import { createBrowserRouter, Navigate } from 'react-router-dom'
import AdminLayout from '../shared/layouts/AdminLayout'
import MainLayout from '../shared/layouts/MainLayout'
import AuthLayout from '../shared/layouts/AuthLayout'
import ProtectedRoute from '../shared/components/auth/ProtectedRoute'
import { lazy, Suspense } from 'react'

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
  </div>
)

const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
)

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'))
const RegisterPage = lazy(() => import('../features/auth/pages/RegisterPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

const AdminDashboardPage = lazy(() => import('../features/admin/pages/DashboardPage'))
const ProgramsPage = lazy(() => import('../features/admin/pages/ProgramsPage'))
const ProgramDetailPage = lazy(() => import('../features/admin/pages/ProgramDetailPage'))
const SessionsPage = lazy(() => import('../features/admin/pages/SessionsPage'))
const SessionDetailPage = lazy(() => import('../features/admin/pages/SessionDetailPage'))
const ContentPage = lazy(() => import('../features/admin/pages/ContentPage'))
const FramesPage = lazy(() => import('../features/admin/pages/FramesPage'))
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
        element: (
          <SuspenseWrapper>
            <LoginPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'register',
        element: (
          <SuspenseWrapper>
            <RegisterPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
  {
    element: <ProtectedRoute />,
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
            element: (
              <SuspenseWrapper>
                <ProgramsPage />
              </SuspenseWrapper>
            ),
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
