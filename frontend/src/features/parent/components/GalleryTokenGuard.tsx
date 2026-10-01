import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { galleryService } from '../../../core/services/gallery'
import { ApiError } from '../../../core/services/backend-client'
import { SUPPORT_EMAIL } from '../../../core/constants/timezone'
import type { GalleryData } from '../../../core/types'

/* ── Context ── */
export type GalleryTokenError =
 | 'INVALID'
 | 'EXPIRED'
 | 'REVOKED'
 | 'CONSENT_REQUIRED'
 | 'RATE_LIMITED'
 | 'SERVER_ERROR'

interface GalleryTokenContextValue {
 token: string
 gallery: GalleryData | null
 loading: boolean
 error: GalleryTokenError | null
}

const GalleryTokenContext = createContext<GalleryTokenContextValue>({
 token: '',
 gallery: null,
 loading: true,
 error: null,
})

export const useGalleryToken = () => useContext(GalleryTokenContext)

/* ── Error mapping ── */
/**
 * Maps a `getByToken` failure to its own screen state so no branch dies on
 * the misleading "invalid link" screen. Token-validation failures keep their
 * original outcomes (400 bad_request / 404 token_invalid → INVALID,
 * 410 token_revoked → REVOKED, 410 token_expired → EXPIRED); everything that
 * is NOT a token problem gets an honest state instead: 403 consent_required,
 * 429 rate limit, and 5xx / network / unexpected → SERVER_ERROR.
 */
function mapGalleryLoadError(err: unknown): GalleryTokenError {
 const status = err instanceof ApiError ? err.status : 0
 const code = err instanceof ApiError ? err.code : ''
 if (code === 'token_revoked') return 'REVOKED'
 if (code === 'token_expired') return 'EXPIRED'
 if (code === 'token_invalid' || status === 400 || status === 404 || status === 410) return 'INVALID'
 if (status === 403 || code === 'consent_required') return 'CONSENT_REQUIRED'
 if (status === 429 || code === 'too_many_requests') return 'RATE_LIMITED'
 return 'SERVER_ERROR'
}

/* ── Shared full-screen error card ── */
interface GalleryErrorScreenProps {
 icon: string
 iconBgClass: string
 title: string
 desc: string
}

function GalleryErrorScreen({ icon, iconBgClass, title, desc }: GalleryErrorScreenProps) {
 const { t } = useTranslation()
 return (
  <div className="min-h-screen flex items-center justify-center bg-surface p-6">
   <div className="text-center max-w-sm">
    <div className={`w-16 h-16 rounded-full ${iconBgClass} flex items-center justify-center mx-auto mb-4`}>
     <span className="text-2xl">{icon}</span>
    </div>
    <h1 className="text-xl font-bold text-on-surface mb-2">{title}</h1>
    <p className="text-sm text-on-surface-variant mb-6">{desc}</p>
    <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
     <span>{t('parent.gallery.needHelp')}</span>
     <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary font-medium hover:underline">{t('parent.gallery.contactUs')}</a>
    </div>
   </div>
  </div>
 )
}

/* ── Guard ── */
interface GalleryTokenGuardProps {
 children: ReactNode
}

export function GalleryTokenGuard({ children }: GalleryTokenGuardProps) {
 const { t } = useTranslation()
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
    if (!res) {
     // 200 without a gallery payload is a server fault — never a blank screen.
     setState({ token, gallery: null, loading: false, error: 'SERVER_ERROR' })
     return
    }
    setState({ token, gallery: res, loading: false, error: null })
   })
   .catch((err) => {
    setState({ token, gallery: null, loading: false, error: mapGalleryLoadError(err) })
   })
 }, [token])

 /* ── Loading ── */
 if (state.loading) {
  return (
   <div className="min-h-screen flex items-center justify-center bg-surface">
    <div className="text-center">
     <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
     <p className="mt-4 text-sm text-on-surface-variant">{t('parent.gallery.loading')}</p>
    </div>
   </div>
  )
 }

 /* ── Error: every failure state renders its own screen ── */
 if (state.error) {
  // The Record type makes this lookup compile-time exhaustive: adding a
  // GalleryTokenError without copy here is a type error, never a crash or
  // a blank render. Copy for the fetch-failure screens is inlined in
  // Indonesian because this change intentionally leaves the locale
  // catalogs untouched (t() is key-typed against them, i18next.d.ts).
  const screens: Record<GalleryTokenError, GalleryErrorScreenProps> = {
   INVALID: {
    icon: '🔗',
    iconBgClass: 'bg-surface-variant',
    title: t('parent.gallery.invalidTitle'),
    desc: t('parent.gallery.invalidDesc'),
   },
   EXPIRED: {
    icon: '⏰',
    iconBgClass: 'bg-yellow-100',
    title: t('parent.gallery.expiredTitle'),
    desc: t('parent.gallery.expiredDesc'),
   },
   REVOKED: {
    icon: '🚫',
    iconBgClass: 'bg-red-100',
    title: t('parent.gallery.revokedTitle'),
    desc: t('parent.gallery.revokedDesc'),
   },
   CONSENT_REQUIRED: {
    icon: '⏳',
    iconBgClass: 'bg-blue-100',
    title: 'Menunggu persetujuan foto',
    desc: 'Orang tua/wali belum memberikan persetujuan untuk menampilkan foto di galeri ini. Silakan hubungi koordinator.',
   },
   RATE_LIMITED: {
    icon: '⏱️',
    iconBgClass: 'bg-orange-100',
    title: 'Terlalu banyak permintaan',
    desc: 'Anda memuat galeri terlalu sering. Silakan coba lagi beberapa saat lagi.',
   },
   SERVER_ERROR: {
    icon: '⚠️',
    iconBgClass: 'bg-red-100',
    title: 'Gangguan server',
    desc: 'Gagal memuat galeri karena gangguan server atau jaringan. Silakan coba lagi.',
   },
  }
  return <GalleryErrorScreen {...screens[state.error]} />
 }

 /* ── Valid ── */
 return (
  <GalleryTokenContext.Provider value={state}>
   {children}
  </GalleryTokenContext.Provider>
 )
}
