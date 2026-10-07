import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Link2, Clock, Hourglass, ServerCrash, type LucideIcon } from 'lucide-react'
import { reportPublicService } from '../../../core/services/reports'
import { ApiError } from '../../../core/services/backend-client'
import type { Participant } from '../../../core/types'
import { SUPPORT_EMAIL } from '../../../core/constants/timezone'
import type { PublicReport } from '../../../core/types'

export type ParentGuardKind = 'report' | 'consent'

export type ParentTokenError = 'INVALID' | 'EXPIRED' | 'RATE_LIMITED' | 'SERVER_ERROR'

/* ── Context ── */
interface ParentTokenContextValue {
 token: string
 report: PublicReport | null
 participant: Participant | null
 loading: boolean
 error: ParentTokenError | null
}

const ParentTokenContext = createContext<ParentTokenContextValue>({
 token: '',
 report: null,
 participant: null,
 loading: true,
 error: null,
})

export const useParentToken = () => useContext(ParentTokenContext)

/* ── Error mapping ── */
/**
 * Maps a `getByToken` failure to its own screen state. Code-first: the
 * backend envelope code decides, the HTTP status only confirms.
 * `token_expired` is checked FIRST — the backend reports both revocation and
 * expiry as 403, so a status-first check would mislabel expired as INVALID.
 * Revoked tokens arrive as `403 token_invalid` (report_repo: revoked rows are
 * denied with the generic code), so they honestly remap to INVALID.
 */
export function mapParentTokenError(err: unknown): ParentTokenError {
 const code = err instanceof ApiError ? err.code : ''
 const status = err instanceof ApiError ? err.status : 0
 if (code === 'token_expired') return 'EXPIRED'
 if (status === 429 || code === 'too_many_requests') return 'RATE_LIMITED'
 if (code === 'token_invalid' || status === 400 || status === 404 || status === 403 || status === 410) return 'INVALID'
 return 'SERVER_ERROR'
}

/* ── Guard ── */
interface ParentTokenGuardProps {
 children: ReactNode
 kind?: ParentGuardKind
}

export function ParentTokenGuard({ children, kind = 'report' }: ParentTokenGuardProps) {
 const { t } = useTranslation()
 const [searchParams] = useSearchParams()
 const token = searchParams.get('token') || ''

 const [state, setState] = useState<ParentTokenContextValue>({
  token,
  report: null,
  participant: null,
  loading: true,
  error: null,
 })

 useEffect(() => {
  if (!token) {
   setState((prev) => ({ ...prev, token, loading: false, error: 'INVALID' }))
   return
  }

  if (kind === 'report') {
   // Public endpoint: GET /api/reports/access?token= (no auth needed).
   reportPublicService
    .getByToken(token)
    .then((res) => {
     setState({
      token,
      report: res ?? null,
      participant: null,
      loading: false,
      error: null,
     })
    })
    .catch((err) => {
     setState({
      token,
      report: null,
      participant: null,
      loading: false,
      error: mapParentTokenError(err),
     })
    })
   return
  }

  // Consent / generic: the token is validated on submit (no public GET exists
  // for a consent token), so we just pass it through to the form.
  setState({ token, report: null, participant: null, loading: false, error: null })
 }, [token, kind])

 /* ── Loading ── */
 if (state.loading) {
  return (
   <div className="min-h-screen flex items-center justify-center bg-surface">
    <div className="text-center">
     <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
     <p className="mt-4 text-sm text-on-surface-variant">{t('parent.token.verifying')}</p>
    </div>
   </div>
  )
 }

 /* ── Error: every failure state renders its own screen ── */
 if (state.error) {
  const screens: Record<
   ParentTokenError,
   { Icon: LucideIcon; iconClass: string; title: string; desc: string }
  > = {
   INVALID: {
    Icon: Link2,
    iconClass: 'bg-surface-variant text-on-surface-variant',
    title: t('parent.token.invalidTitle'),
    desc: t('parent.token.invalidDesc'),
   },
   EXPIRED: {
    Icon: Clock,
    iconClass: 'bg-yellow-100 text-yellow-700',
    title: t('parent.token.expiredTitle'),
    desc: t('parent.token.expiredDesc'),
   },
   RATE_LIMITED: {
    Icon: Hourglass,
    iconClass: 'bg-orange-100 text-orange-700',
    title: t('parent.token.rateLimitedTitle'),
    desc: t('parent.token.rateLimitedDesc'),
   },
   SERVER_ERROR: {
    Icon: ServerCrash,
    iconClass: 'bg-red-100 text-red-700',
    title: t('parent.token.serverErrorTitle'),
    desc: t('parent.token.serverErrorDesc'),
   },
  }
  const { Icon, iconClass, title, desc } = screens[state.error]
  return (
   <div className="min-h-screen flex items-center justify-center bg-surface p-6">
    <div className="text-center max-w-sm">
     <div className={`w-16 h-16 rounded-full ${iconClass} flex items-center justify-center mx-auto mb-4`}>
      <Icon className="w-8 h-8" aria-hidden="true" />
     </div>
     <h1 className="text-xl font-bold text-on-surface mb-2">{title}</h1>
     <p className="text-sm text-on-surface-variant mb-6">{desc}</p>
     <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
      <span>{t('parent.token.needHelp')}</span>
      <a
       href={`mailto:${SUPPORT_EMAIL}`}
       className="text-primary font-medium hover:underline"
      >
       {t('parent.token.contact')}
      </a>
     </div>
    </div>
   </div>
  )
 }

 /* ── Valid ── */
 return (
  <ParentTokenContext.Provider value={state}>
   {children}
  </ParentTokenContext.Provider>
 )
}
