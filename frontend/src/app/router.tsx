import { createBrowserRouter } from 'react-router-dom'
import { rootRoute, notFoundRoute } from './routes/index'
import { authRoutes } from './routes/auth'
import { adminRoutes } from './routes/admin'
import { fasilitatorRoutes } from './routes/fasilitator'
import { parentRoutes } from './routes/parent'
import { learnerRoute } from './routes/learner'

export const router = createBrowserRouter([
  rootRoute,
  ...authRoutes,
  ...adminRoutes,
  ...fasilitatorRoutes,
  ...parentRoutes,
  learnerRoute,
  notFoundRoute,
])
