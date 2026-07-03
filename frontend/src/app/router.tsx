import { createBrowserRouter, Navigate } from 'react-router-dom'

// Layouts
import MainLayout from '../shared/layouts/MainLayout'
import AdminLayout from '../shared/layouts/AdminLayout'
import AuthLayout from '../shared/layouts/AuthLayout'

// Pages - Lazy loaded for better performance
import { lazy, Suspense } from 'react'

// Loading component
const Loading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
  </div>
)

// Lazy load pages
const LandingPage = lazy(() => import('../pages/LandingPage'))
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'))
const RegisterPage = lazy(() => import('../features/auth/pages/RegisterPage'))
const AdminDashboardPage = lazy(() => import('../features/admin/pages/DashboardPage'))
const AdminStoriesPage = lazy(() => import('../features/admin/pages/StoriesPage'))
const FasilitatorDashboardPage = lazy(() => import('../features/fasilitator/pages/DashboardPage'))
const FasilitatorActivitiesPage = lazy(() => import('../features/fasilitator/pages/ActivitiesPage'))
const ParentDashboardPage = lazy(() => import('../features/parent/pages/DashboardPage'))
const ParentStoriesPage = lazy(() => import('../features/parent/pages/StoriesPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

// Suspense wrapper
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<Loading />}>{children}</Suspense>
)

// Router configuration
export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <LandingPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'admin',
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
            path: 'stories',
            element: (
              <SuspenseWrapper>
                <AdminStoriesPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
      {
        path: 'fasilitator',
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
        path: 'parent',
        element: <AdminLayout />,
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
    path: '*',
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
])
