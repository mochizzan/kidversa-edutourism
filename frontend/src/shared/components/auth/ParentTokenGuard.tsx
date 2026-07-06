import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { reportService } from '../../../core/services/reports'
import { sessionService } from '../../../core/services/sessions'
import { seedParticipants } from '../../../core/services/mock/data/seed'
import type { Report, Participant } from '../../../core/types'

/* ── Context ── */
interface ParentTokenContextValue {
  token: string
  report: Report | null
  participant: Participant | null
  participantId: string | null
  reportId: string | null
  loading: boolean
  error: 'INVALID' | 'EXPIRED' | null
}

const ParentTokenContext = createContext<ParentTokenContextValue>({
  token: '',
  report: null,
  participant: null,
  participantId: null,
  reportId: null,
  loading: true,
  error: null,
})

export const useParentToken = () => useContext(ParentTokenContext)

/* ── Guard ── */
interface ParentTokenGuardProps {
  children: ReactNode
}

export function ParentTokenGuard({ children }: ParentTokenGuardProps) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState<ParentTokenContextValue>({
    token,
    report: null,
    participant: null,
    participantId: null,
    reportId: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!token) {
      setState((prev) => ({ ...prev, loading: false, error: 'INVALID' }))
      return
    }

    let cancelled = false

    const validate = async () => {
      try {
        // Try to find a report by parent_access_token
        const sessions = await sessionService.getAll({ limit: 50 })
        let foundReport: Report | null = null
        for (const session of sessions.data) {
          const reports = await reportService.getBySession(session.id)
          const match = reports.find((r) => r.parent_access_token === token)
          if (match) {
            foundReport = match
            break
          }
        }

        if (foundReport) {
          // Try to load participant details
          let participant: Participant | null = null
          try {
            const participants = await sessionService.getParticipants(foundReport.session_id)
            participant = participants.find((p) => p.id === foundReport!.participant_id) || null
          } catch {
            // Fallback to seed data
            participant = seedParticipants.find((p) => p.id === foundReport!.participant_id) || null
          }

          // Check if expired (sent more than 30 days ago)
          const isExpired = foundReport.sent_at
            ? Date.now() - new Date(foundReport.sent_at).getTime() > 30 * 24 * 60 * 60 * 1000
            : false

          if (!cancelled) {
            setState({
              token,
              report: foundReport,
              participant,
              participantId: foundReport.participant_id,
              reportId: foundReport.id,
              loading: false,
              error: isExpired ? 'EXPIRED' : null,
            })
          }
          return
        }

        // Not found as report token — try as participant ID (consent flow)
        const participant = seedParticipants.find((p) => p.id === token) || null

        if (!cancelled) {
          setState({
            token,
            report: null,
            participant,
            participantId: participant?.id || null,
            reportId: null,
            loading: false,
            error: participant ? null : 'INVALID',
          })
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, error: 'INVALID' }))
        }
      }
    }

    validate()
    return () => { cancelled = true }
  }, [token])

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
          <h1 className="text-xl font-bold text-on-surface mb-2">Link tidak dikenal</h1>
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
