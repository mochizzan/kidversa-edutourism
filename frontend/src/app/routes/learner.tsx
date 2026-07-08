import { lazy } from 'react'
import type { RouteObject } from 'react-router-dom'
import { SuspenseWrapper } from './helpers'

const LearnerKioskPage = lazy(() => import('../../pages/LearnerKioskPage'))

export const learnerRoute: RouteObject = {
  path: '/learner/:sessionId/:stageId',
  element: (
    <SuspenseWrapper>
      <LearnerKioskPage />
    </SuspenseWrapper>
  ),
}
