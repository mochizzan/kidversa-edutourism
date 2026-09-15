import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { galleryService } from '../../../core/services/gallery'
import { ApiError } from '../../../core/services/backend-client'
import { SUPPORT_EMAIL } from '../../../core/constants/timezone'
import type { GalleryData } from '../../../core/types'

/* ── Context ── */
interface GalleryTokenContextValue {
  token: string
  gallery: GalleryData | null
  loading: boolean
  error: 'INVALID' | 'EXPIRED' | 'REVOKED' | null
}

const GalleryTokenContext = createContext<GalleryTokenContextValue>({
  token: '',
  gallery: null,
  loading: true,
  error: null,
})

export const useGalleryToken = () => useContext(GalleryTokenContext)

/* ── Guard ── */
interface GalleryTokenGuardProps {
  children: ReactNode
}

export function GalleryTokenGuard({ children }: GalleryTokenGuardProps) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [state, setState] = useState<GalleryTokenContextValue>({
    token,
    gallery: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!token) {
      setState({ token, gallery: null, loading: false, error: 'INVALID' })
      return
    }

    galleryService
      .getByToken(token)
      .then((res) => {
        setState({ token, gallery: res, loading: false, error: null })
      })
      .catch((err) => {
        const code = err instanceof ApiError ? err.code : ''
        const status = err instanceof ApiError ? err.status : 0
        let error: 'INVALID' | 'EXPIRED' | 'REVOKED' = 'INVALID'
        if (status === 410) {
          if (code === 'token_revoked') error = 'REVOKED'
          else if (code === 'token_expired') error = 'EXPIRED'
        } else if (code === 'token_invalid' || status === 404) {
          error = 'INVALID'
        }
        setState({ token, gallery: null, loading: false, error })
      })
  }, [token])

  /* ── Loading ── */
  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-on-surface-variant">Memuat galeri...</p>
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
            Tautan galeri tidak valid atau tidak ditemukan. Silakan hubungi koordinator.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span>Butuh bantuan?</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium hover:underline">Hubungi Kami</a>
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
          <h1 className="text-xl font-bold text-on-surface mb-2">Galeri sudah tidak berlaku</h1>
          <p className="text-sm text-on-surface-variant mb-6">
            Tautan galeri ini sudah kedaluwarsa. Silakan hubungi koordinator untuk tautan baru.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span>Butuh bantuan?</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium hover:underline">Hubungi Kami</a>
          </div>
        </div>
      </div>
    )
  }

  /* ── Revoked ── */
  if (state.error === 'REVOKED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🚫</span>
          </div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Galeri ditutup</h1>
          <p className="text-sm text-on-surface-variant mb-6">
            Tautan galeri ini sudah ditutup oleh admin. Silakan hubungi koordinator.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
            <span>Butuh bantuan?</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium hover:underline">Hubungi Kami</a>
          </div>
        </div>
      </div>
    )
  }

  /* ── Valid ── */
  return (
    <GalleryTokenContext.Provider value={state}>
      {children}
    </GalleryTokenContext.Provider>
  )
}
