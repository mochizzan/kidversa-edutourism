import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router-dom'
import AdminLayout from '../../shared/layouts/AdminLayout'
import { guardedRoute } from './helpers'

// ── Overview ──
const AdminDashboardPage = lazy(() => import('../../features/admin/pages/DashboardPage'))
const LiveMonitorPage = lazy(() => import('../../features/admin/pages/LiveMonitorPage'))

// ── Program ──
const ProgramsPage = lazy(() => import('../../features/admin/pages/ProgramsPage'))
const ProgramDetailPage = lazy(() => import('../../features/admin/pages/ProgramDetailPage'))
const ProgramStagePage = lazy(() => import('../../features/admin/pages/ProgramStagePage'))
const SessionsPage = lazy(() => import('../../features/admin/pages/SessionsPage'))
const SessionDetailPage = lazy(() => import('../../features/admin/pages/SessionDetailPage'))
const ParticipantsPage = lazy(() => import('../../features/admin/pages/ParticipantsPage'))
const ParticipantFormPage = lazy(() => import('../../features/admin/pages/ParticipantFormPage'))
const ParticipantDetailPage = lazy(() => import('../../features/admin/pages/ParticipantDetailPage'))
const ReportListPage = lazy(() => import('../../features/admin/pages/ReportListPage'))
const ReportSessionPage = lazy(() => import('../../features/admin/pages/ReportSessionPage'))
const ReportReviewPage = lazy(() => import('../../features/admin/pages/ReportReviewPage'))
const MissionBankPage = lazy(() => import('../../features/admin/pages/MissionBankPage'))
const MissionFormPage = lazy(() => import('../../features/admin/pages/MissionFormPage'))

// ── Content ──
const ContentPage = lazy(() => import('../../features/admin/pages/ContentPage'))
const ContentFormPage = lazy(() => import('../../features/admin/pages/ContentFormPage'))
const FramesPage = lazy(() => import('../../features/admin/pages/FramesPage'))
const FrameFormPage = lazy(() => import('../../features/admin/pages/FrameFormPage'))
const FrameUploadPage = lazy(() => import('../../features/admin/pages/FrameUploadPage'))
const RecordingReviewPage = lazy(() => import('../../features/admin/pages/RecordingReviewPage'))
const RecordingDetailPage = lazy(() => import('../../features/admin/pages/RecordingDetailPage'))

// ── Settings ──
const UsersPage = lazy(() => import('../../features/admin/pages/UsersPage'))
const UserFormPage = lazy(() => import('../../features/admin/pages/UserFormPage'))
const TenantsPage = lazy(() => import('../../features/admin/pages/TenantsPage'))
const ConsentMonitorPage = lazy(() => import('../../features/admin/pages/ConsentMonitorPage'))

export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },

      // ── Overview ──
      guardedRoute('dashboard', 'dashboard', AdminDashboardPage),
      guardedRoute('live', 'live', LiveMonitorPage),
      guardedRoute('live/:sessionId', 'live', LiveMonitorPage),

      // ── Program ──
      guardedRoute('programs', 'programs', ProgramsPage),
      guardedRoute('programs/:programId', 'programs', ProgramDetailPage),
      guardedRoute('programs/:programId/stages/:stageId', 'programs', ProgramStagePage),
      guardedRoute('sessions', 'sessions', SessionsPage),
      guardedRoute('sessions/new', 'sessions', SessionDetailPage),
      guardedRoute('sessions/:sessionId', 'sessions', SessionDetailPage),
      guardedRoute('participants', 'participants', ParticipantsPage),
      guardedRoute('participants/:participantId/edit', 'participants', ParticipantFormPage),
      guardedRoute('participants/:participantId', 'participants', ParticipantDetailPage),
      guardedRoute('reports', 'reports', ReportListPage),
      guardedRoute('reports/:sessionId', 'reports', ReportSessionPage),
      guardedRoute('reports/:sessionId/review/:reportId', 'reports', ReportReviewPage),
      guardedRoute('missions', 'missions', MissionBankPage),
      guardedRoute('missions/new', 'missions', MissionFormPage),
      guardedRoute('missions/:missionId/edit', 'missions', MissionFormPage),

      // ── Content ──
      guardedRoute('content', 'content', ContentPage),
      guardedRoute('content/new', 'content', ContentFormPage),
      guardedRoute('content/:contentId/edit', 'content', ContentFormPage),
      guardedRoute('frames/upload', 'frames', FrameUploadPage),
      guardedRoute('frames', 'frames', FramesPage),
      guardedRoute('frames/:frameId/edit', 'frames', FrameFormPage),
      guardedRoute('recordings', 'recordings', RecordingReviewPage),
      guardedRoute('recordings/:recordingId', 'recordings', RecordingDetailPage),

      // ── Settings ──
      guardedRoute('users', 'users', UsersPage),
      guardedRoute('users/new', 'users', UserFormPage),
      guardedRoute('users/:userId/edit', 'users', UserFormPage),
      guardedRoute('tenants', 'tenants', TenantsPage),
      guardedRoute('consent', 'consent', ConsentMonitorPage),
    ],
  },
]
