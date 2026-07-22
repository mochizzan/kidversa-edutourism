import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { SuspenseWrapper } from './helpers'

const LearnerKioskPage = lazy(() => import('../../features/learner/pages/LearnerKioskPage'))

export const learnerRoute: RouteObject = {
  path: '/learner/:sessionId/:stageId',
  element: (
    <SuspenseWrapper>
      <LearnerKioskPage />
    </SuspenseWrapper>
  ),
}

// Public kiosk entry that carries the session id in the path; the kiosk token
// is supplied via the `?token=` query string (P3).
export const kioskRoute: RouteObject = {
  path: '/kiosk/session/:sessionId/:stageId',
  element: (
    <SuspenseWrapper>
      <LearnerKioskPage />
    </SuspenseWrapper>
  ),
}
