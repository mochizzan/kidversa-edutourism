import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RouteGuard } from '../../shared/components/auth/RouteGuard'
import { SuspenseWrapper } from './helpers'
import { ErrorBoundary } from '../../shared/components/feedback/ErrorBoundary'

const LearnerKioskPage = lazy(() => import('../../features/learner/pages/LearnerKioskPage'))

export const learnerRoute: RouteObject = {
  path: '/learner/:groupId?/:sessionId/:stageId/:substageId?',
  element: (
    <RouteGuard public>
      <ErrorBoundary>
        <SuspenseWrapper>
          <LearnerKioskPage />
        </SuspenseWrapper>
      </ErrorBoundary>
    </RouteGuard>
  ),
}

// Public kiosk entry that carries the session id in the path; the kiosk token
// is supplied via the `?token=` query string (P3). The optional :substageId
// selects a Kegiatan (session_substage) under the :stageId (SubTopik).
export const kioskRoute: RouteObject = {
  path: '/kiosk/session/:groupId?/:sessionId/:stageId/:substageId?',
  element: (
    <RouteGuard public>
      <ErrorBoundary>
        <SuspenseWrapper>
          <LearnerKioskPage />
        </SuspenseWrapper>
      </ErrorBoundary>
    </RouteGuard>
  ),
}
