import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { useAuthStore } from './core/stores/authStore'

function App() {
  const { checkSession, isLoading } = useAuthStore()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Don't render router until auth state is resolved
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto" />
          <p className="mt-4 text-gray-600">Memuat...</p>
        </div>
      </div>
    )
  }

  return <RouterProvider router={router} />
}

export default App
