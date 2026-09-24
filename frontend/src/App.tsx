import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { useAuthStore, redirectToLogin } from './core/stores/authStore'
import { healthCheck, registerUnauthorizedHandler } from './core/services/backend-client'
import { ROUTES } from './core/constants/app'
import { TIMING } from './core/constants/timing'
import { UserRole } from './core/types/enums'
import { ErrorBoundary } from './shared/components/feedback/ErrorBoundary'
import { ToastProvider } from './shared/components/feedback/Toast'
import { useTenantStore } from './core/stores/tenantStore'
import { Logo } from './shared/components/ui/Logo'

/* ── Splash Screen ── */
function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<'pop' | 'text' | 'exit'>('pop')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('text'), TIMING.SPLASH_POP_MS),
      setTimeout(() => {
        setPhase('exit')
        setTimeout(onFinish, TIMING.SPLASH_EXIT_MS)
      }, TIMING.SPLASH_TEXT_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onFinish])

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-primary via-primary-dark to-primary-900 flex flex-col items-center justify-center p-8 relative overflow-hidden transition-opacity duration-500 ${phase === 'exit' ? 'opacity-0' : 'opacity-100'
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
            <Logo
              alt="Kidversa"
              className="w-20 h-20 md:w-24 md:h-24 object-contain"
            />
          </div>
        </div>
      )}

      {/* Text – slide up */}
      <div
        className={`transition-all duration-700 delay-300 ease-out text-center mt-8 ${phase === 'text' || phase === 'exit'
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
          {t('common.splash.tagline')}
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
  const { t } = useTranslation()
  const { checkSession, isLoading } = useAuthStore()
  const [splashDone, setSplashDone] = useState(false)
  const [backendDown, setBackendDown] = useState(false)
  // SUPER_ADMIN needs its active tenant resolved before any operational route
  // (incl. the AI-narrative button) is reachable. We block the router until
  // fetchTenants settles (success OR failure) so ACTIVE_TENANT_ID is set and the
  // tenant-scoped calls never fire with an empty tenant mid-race after refresh.
  const [tenantReady, setTenantReady] = useState(false)

  // Public kiosk routes bypass auth + splash entirely — participants access
  // these directly via URL without logging in.
  const isPublicKiosk =
    window.location.pathname.startsWith(ROUTES.LEARNER.BASE) ||
    window.location.pathname.startsWith(ROUTES.KIOSK.BASE)

  // Route any caught 401 (refresh already failed in backendClient) to login.
  // `App` renders <RouterProvider> below, so it lives *outside* the router
  // context and cannot use useNavigate(). The router instance itself exposes
  // an imperative navigate() that works from anywhere.
  useEffect(() => {
    if (isPublicKiosk) return
    registerUnauthorizedHandler(() =>
      router.navigate(ROUTES.AUTH.LOGIN, { replace: true }),
    )
    // ApiError 401 yang lepas (sudah ditangani fireUnauthorized via navigasi)
    // tidak perlu noise di konsol. Rejection lain tetap di-log.
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { status?: number } | undefined
      if (r && r.status === 401) {
        e.preventDefault?.()
        return
      }
      console.error('Unhandled promise rejection:', e.reason)
    }
    window.addEventListener('unhandledrejection', onReject)
    return () => window.removeEventListener('unhandledrejection', onReject)
  }, [isPublicKiosk])

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
    // Hanya fetch tenant + auto-select bila user SUDAH terautentikasi DAN
    // SUPER_ADMIN. Untuk user belum login, pemanggilan ini memicu 401 lalu
    // percobaan refresh yang berujung 400 (lihat backendClient.refreshAccessToken).
    // Untuk non-SA, endpoint ini 403 (Forbidden) — juga tidak perlu dipanggil.
    const authState = useAuthStore.getState()
    if (authState.isAuthenticated && authState.user?.role === UserRole.SUPER_ADMIN) {
      try {
        await useTenantStore.getState().fetchTenants()
      } catch (err) {
        // 401 berarti sesi tidak valid meski checkSession lolos ⇒ logout + login.
        const status = (err as { status?: number })?.status
        if (status === 401) {
          redirectToLogin()
        }
        // kegagalan lain bersifat opsional; abaikan.
      }
    }
    // SA auto-select: pastikan tenant terpilih setelah fetchTenants selesai
    // (race cold-start dapat mengembalikan [] lalu seed). Jika activeTenant
    // masih null padahal tenant ada, paksa pilih tenants[0] agar header
    // X-Tenant-Id ter-set sebelum router terbuka. Zero tenant → biarkan null
    // supaya TenantGuard menampilkan picker dan /admin/tenants tetap reachable.
    const a = useAuthStore.getState()
    if (a.isAuthenticated && a.user?.role === UserRole.SUPER_ADMIN) {
      const ts = useTenantStore.getState()
      if (!ts.activeTenant && ts.tenants.length > 0) {
        ts.setActiveTenant(ts.tenants[0])
      }
    }
    // Jangan hang: tetap lanjut meski fetch tenant gagal (guard route akan
    // menampilkan pemilih tenant). Yang penting race startup sudah selesai.
    setTenantReady(true)
  }

  useEffect(() => {
    if (isPublicKiosk) {
      setSplashDone(true)
      setTenantReady(true)
      useAuthStore.setState({ isLoading: false })
      return
    }
    void runStartup()
  }, [checkSession, isPublicKiosk])

  // ── Backend unavailable panel ──
  if (backendDown) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-dark shadow-lg flex items-center justify-center mb-4">
          <Logo alt="Kidversa" className="w-10 h-10 object-contain" />
        </div>
        <h1 className="text-xl font-bold text-on-surface">{t('common.backend.title')}</h1>
        <p className="text-sm text-on-surface-variant/60 mt-2 max-w-[280px] leading-relaxed">
          {t('common.backend.desc')}
        </p>
        <button
          type="button"
          onClick={() => void runStartup()}
          className="mt-6 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-primary-dark text-on-primary hover:shadow-lg hover:shadow-primary/25 transition-all"
        >
          {t('common.error.retry')}
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

  // SUPER_ADMIN tenant must be resolved before operational routes render
  // (see runStartup). Blocks the router only briefly at startup; tenantReady
  // is always set (even on fetch failure) so we never hang.
  if (!tenantReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return <ErrorBoundary><ToastProvider><RouterProvider router={router} /></ToastProvider></ErrorBoundary>
}

export default App
