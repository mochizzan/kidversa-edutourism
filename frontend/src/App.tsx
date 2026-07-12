import { useEffect, useState } from 'react'
import { RouterProvider, useNavigate } from 'react-router-dom'
import { router } from './app/router'
import { useAuthStore, registerUnauthorizedHandler } from './core/stores/authStore'
import { ROUTES } from './core/constants/app'
import { ErrorBoundary } from './shared/components/feedback/ErrorBoundary'
import { ToastProvider } from './shared/components/feedback/Toast'
import { healthCheck } from './core/services/backendClient'

/* ── Splash Screen ── */
function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<'pop' | 'text' | 'exit'>('pop')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('text'), 700),
      setTimeout(() => {
        setPhase('exit')
        setTimeout(onFinish, 500)
      }, 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onFinish])

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-primary via-primary-dark to-primary-900 flex flex-col items-center justify-center p-8 relative overflow-hidden transition-opacity duration-500 ${
        phase === 'exit' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Decorative blurs */}
      <div className="absolute -right-24 -bottom-24 w-80 h-80 bg-primary-light/15 rounded-full blur-3xl" />
      <div className="absolute -left-24 -top-24 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-primary-200/10 rounded-full blur-3xl" />

      {/* Logo – pop animation */}
      {phase !== 'pop' && (
        <div className="animate-splash-pop">
          <div className="w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-white shadow-2xl flex items-center justify-center">
            <img
              src="/logo.png"
              alt="Kidversa"
              className="w-20 h-20 md:w-24 md:h-24 object-contain"
            />
          </div>
        </div>
      )}

      {/* Text – slide up */}
      <div
        className={`transition-all duration-700 delay-300 ease-out text-center mt-8 ${
          phase === 'text' || phase === 'exit'
            ? 'opacity-100 translate-y-0'
            : 'opacity-0 translate-y-6 pointer-events-none'
        }`}
      >
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
          Kidversa
        </h1>
        <p className="text-primary-200 text-lg md:text-xl mt-1 font-light tracking-wide">
          Edutourism
        </p>
        <p className="text-primary-300/60 text-xs mt-3 max-w-[180px] mx-auto leading-relaxed">
          Belajar sambil berpetualang
        </p>
      </div>

      {/* Loading dots */}
      <div className="absolute bottom-16 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-white/40 animate-bounce"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── App Root ── */
function App() {
  const { checkSession, isLoading } = useAuthStore()
  const [splashDone, setSplashDone] = useState(false)
  const [backendDown, setBackendDown] = useState(false)
  const navigate = useNavigate()

  // Route any caught 401 (refresh already failed in backendClient) to login.
  useEffect(() => {
    registerUnauthorizedHandler(() => navigate(ROUTES.AUTH.LOGIN, { replace: true }))
  }, [navigate])

  const runStartup = async () => {
    try {
      const ok = await healthCheck()
      if (!ok) {
        setBackendDown(true)
        return
      }
    } catch {
      setBackendDown(true)
      return
    }
    setBackendDown(false)
    await checkSession()
  }

  useEffect(() => {
    void runStartup()
  }, [checkSession])

  // ── Backend unavailable panel ──
  if (backendDown) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-dark shadow-lg flex items-center justify-center mb-4">
          <img src="/logo.png" alt="Kidversa" className="w-10 h-10 object-contain" />
        </div>
        <h1 className="text-xl font-bold text-on-surface">Backend tidak tersedia</h1>
        <p className="text-sm text-on-surface-variant/60 mt-2 max-w-[280px] leading-relaxed">
          Tidak dapat terhubung ke server. Pastikan server berjalan, lalu coba lagi.
        </p>
        <button
          type="button"
          onClick={() => void runStartup()}
          className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-primary-dark text-on-primary hover:shadow-lg hover:shadow-primary/25 transition-all"
        >
          Coba Lagi
        </button>
      </div>
    )
  }

  // Splash screen (always shows at least 3.7 s)
  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />
  }

  // Still loading after splash? (unlikely, but safe)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <ErrorBoundary><ToastProvider><RouterProvider router={router} /></ToastProvider></ErrorBoundary>
}

export default App
