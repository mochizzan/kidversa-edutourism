import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { reportPublicService } from '../../../core/services/reports'
import { ApiError } from '../../../core/services/backendClient'
import type { Participant } from '../../../core/types'

/* ── Public report shape (anti-IDOR DTO from GET /api/reports/access) ──
   Mirrors backend PublicReportDTO. PII and the raw token are intentionally
   absent — the parent flow only ever sees this stripped payload. */
export interface PublicReport {
  id: string
  participant_id: string
  session_id: string
  status: string
  ai_narrative_final?: string
  mission_ids?: string[]
  report_pdf_url?: string
}

export type ParentGuardKind = 'report' | 'consent'

/* ── Context ── */
interface ParentTokenContextValue {
  token: string
  report: PublicReport | null
  participant: Participant | null
  loading: boolean
  error: 'INVALID' | 'EXPIRED' | null
}

const ParentTokenContext = createContext<ParentTokenContextValue>({
  token: '',
  report: null,
  participant: null,
  loading: true,
  error: null,
})

export const useParentToken = () => useContext(ParentTokenContext)

/* ── Guard ── */
interface ParentTokenGuardProps {
  children: ReactNode
  kind?: ParentGuardKind
}

export function ParentTokenGuard({ children, kind = 'report' }: ParentTokenGuardProps) {
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
            report: (res ?? null) as PublicReport | null,
            participant: null,
            loading: false,
            error: null,
          })
        })
        .catch((err) => {
          const code = err instanceof ApiError ? err.code : ''
          const status = err instanceof ApiError ? err.status : 0
          // Backend returns 401/403/404 with token_invalid / token_expired.
          const expired = code === 'token_expired' || status === 403
          setState({
            token,
            report: null,
            participant: null,
            loading: false,
            error: expired ? 'EXPIRED' : 'INVALID',
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
          <p className="mt-4 text-sm text-on-surface-variant">Memverifikasi tautan...</p>
        </div>
      </div>
    )
  }

  /* ── Invalid ── */
  if (state.error === 'INVALID') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔗</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Link tidak valid</h1>
          <p className="text-sm text-on-surface-variant mb-6">
            Tautan yang Anda akses tidak valid atau tidak ditemukan. Silakan hubungi koordinator untuk mendapatkan tautan baru.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span>Butuh bantuan?</span>
            <a
              href={`mailto:support@kidversa.id`}
              className="text-primary font-medium hover:underline"
            >
              Hubungi Kami
            </a>
          </div>
        </div>
      </div>
    )
  }

  /* ── Expired ── */
  if (state.error === 'EXPIRED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⏰</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Link sudah tidak berlaku</h1>
          <p className="text-sm text-on-surface-variant mb-6">
            Tautan ini sudah kedaluwarsa. Jika Anda merasa ini kesalahan, silakan hubungi koordinator untuk mendapatkan tautan baru.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span>Butuh bantuan?</span>
            <a
              href={`mailto:support@kidversa.id`}
              className="text-primary font-medium hover:underline"
            >
              Hubungi Kami
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
