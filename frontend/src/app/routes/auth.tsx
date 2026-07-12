import { Navigate, type RouteObject } from 'react-router-dom'
import AuthLayout from '../../shared/layouts/AuthLayout'
import LoginPage from '../../features/auth/pages/LoginPage'
import RegisterPage from '../../features/auth/pages/RegisterPage'
import ChangePasswordPage from '../../features/auth/pages/ChangePasswordPage'

export const authRoutes: RouteObject[] = [
  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'change-password', element: <ChangePasswordPage /> },
    ],
  },
]
