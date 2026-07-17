import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Camera,
  Mic,
  User,
  ShieldCheck,
  AlertTriangle,
  CalendarDays,
  MapPin,
  Check,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { consentService, type ConsentInfo } from '../../../core/services/consent'
import { ApiError } from '../../../core/services/backendClient'
import { cn } from '../../../core/utils/cn'
import { formatDate } from '../../../shared/utils'

/* ── A single Ya / Tidak choice control ── */
interface ChoiceProps {
  label: string
  value: boolean | null
  onChange: (v: boolean) => void
}

function YaTidakChoice({ label, value, onChange }: ChoiceProps) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-2 gap-3"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        onClick={() => onChange(true)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 text-base font-semibold transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          value === true
            ? 'border-green-600 bg-green-50 text-green-700 focus-visible:ring-green-500'
            : 'border-outline-variant bg-surface text-on-surface-variant hover:border-green-400 hover:text-green-700 focus-visible:ring-green-400',
        )}
      >
        <CheckCircle2
          className={cn(
            'w-5 h-5 shrink-0',
            value === true ? 'text-green-600' : 'text-on-surface-variant/60',
          )}
        />
        Ya, Setuju
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        onClick={() => onChange(false)}
        className={cn(
          'flex items-center justify-center gap-2 rounded-2xl border-2 px-4 py-4 text-base font-semibold transition-all',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          value === false
            ? 'border-error bg-error-container text-on-error-container focus-visible:ring-error'
            : 'border-outline-variant bg-surface text-on-surface-variant hover:border-error/60 hover:text-on-error-container focus-visible:ring-error/60',
        )}
      >
        <XCircle
          className={cn(
            'w-5 h-5 shrink-0',
            value === false ? 'text-error' : 'text-on-surface-variant/60',
          )}
        />
        Tidak
      </button>
    </div>
  )
}

/* ── Reusable state panel (error / expired / success) ── */
function StatePanel({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'warn' | 'error' | 'success'
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const tones = {
    warn: 'bg-yellow-50 text-yellow-700',
    error: 'bg-error-container text-on-error-container',
    success: 'bg-green-50 text-green-700',
  }
  return (
    <div className="text-center py-6 px-2">
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4',
          tones[tone],
        )}
      >
        {icon}
      </div>
      <h2 className="text-xl font-bold text-on-surface mb-2">{title}</h2>
      <div className="text-sm text-on-surface-variant max-w-sm mx-auto">{children}</div>
    </div>
  )
}

/* ── Inner form component (inside guard) ── */
function ConsentForm() {
  const { token } = useParentToken()
  const { addToast } = useGlobalToast()

  const [info, setInfo] = useState<ConsentInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)

  const [recordingConsent, setRecordingConsent] = useState<boolean | null>(null)
  const [photoConsent, setPhotoConsent] = useState<boolean | null>(null)
  const [parentName, setParentName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [lockedError, setLockedError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setInfoLoading(false)
      return
    }
    consentService
      .getInfo(token)
      .then((res) => {
        if (res.status === 'invalid') {
          setLockedError(
            'Tautan persetujuan tidak valid atau sudah digunakan. Silakan hubungi koordinator untuk tautan baru.',
          )
          return
        }
        if (res.status === 'expired') {
          setLockedError(
            'Tautan persetujuan sudah kedaluwarsa. Silakan hubungi koordinator untuk tautan baru.',
          )
          return
        }
        setInfo(res)
      })
      .catch(() => {
        // Non-fatal: the form still works; personalization just stays generic.
        setInfo({ status: 'ok' })
      })
      .finally(() => setInfoLoading(false))
  }, [token])

  const handleSubmit = async () => {
    if (lockedError) return
    if (!parentName.trim()) {
      addToast({ type: 'error', message: 'Silakan masukkan nama Anda.' })
      return
    }
    if (recordingConsent === null || photoConsent === null) {
      addToast({ type: 'error', message: 'Silakan pilih Ya/Tidak untuk kedua izin.' })
      return
    }

    setSubmitting(true)

    try {
      await consentService.submitCombined(token, recordingConsent, photoConsent)
      setSuccess(true)
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      if (code === 'token_consumed' || code === 'token_invalid') {
        setAlreadySubmitted(true)
        return
      }
      if (code === 'token_expired') {
        setLockedError('Tautan persetujuan sudah kedaluwarsa. Silakan hubungi koordinator.')
        return
      }
      addToast({
        type: 'error',
        message: 'Gagal mengirim persetujuan. Silakan coba lagi.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Locked (invalid/expired token) ── */
  if (lockedError) {
    return (
      <StatePanel
        tone="warn"
        icon={<AlertTriangle className="w-8 h-8 text-yellow-600" />}
        title="Tautan Tidak Berlaku"
      >
        {lockedError}
      </StatePanel>
    )
  }

  /* ── Already submitted (single-use token already used) ── */
  if (alreadySubmitted) {
    return (
      <StatePanel
        tone="success"
        icon={<Check className="w-8 h-8 text-green-600" />}
        title="Persetujuan Sudah Dikirim"
      >
        Persetujuan dari tautan ini sudah diterima sebelumnya. Terima kasih telah
        mengonfirmasi izin untuk {info?.child_name || 'buah hati Anda'}.
      </StatePanel>
    )
  }

  /* ── Success ── */
  if (success) {
    return (
      <StatePanel
        tone="success"
        icon={<CheckCircle2 className="w-8 h-8 text-green-600" />}
        title="Terima Kasih!"
      >
        <p className="mb-1">Persetujuan Anda berhasil dikirim.</p>
        <p className="text-xs">
          Koordinator akan memproses data partisipasi {info?.child_name || 'buah hati Anda'}.
        </p>
      </StatePanel>
    )
  }

  const completedSteps =
    (recordingConsent !== null ? 1 : 0) +
    (photoConsent !== null ? 1 : 0) +
    (parentName.trim() ? 1 : 0)
  const progressPct = Math.round((completedSteps / 3) * 100)

  /* ── Form ── */
  return (
    <div className="space-y-5">
      {/* Child + session identity */}
      <Card padding="md">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
            <User className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-on-surface-variant">
              Formulir Persetujuan
            </p>
            {infoLoading ? (
              <div className="h-6 w-32 mt-0.5 rounded bg-surface-variant animate-pulse" />
            ) : (
              <h2 className="text-lg font-bold text-on-surface truncate">
                {info?.child_name || 'Peserta Edutourism'}
              </h2>
            )}
            {!infoLoading && info?.parent_name && (
              <p className="text-sm text-on-surface-variant truncate">
                Orang tua / wali: {info.parent_name}
              </p>
            )}
          </div>
        </div>

        {!infoLoading && (info?.session_name || info?.session_date || info?.location) && (
          <div className="mt-4 pt-4 border-t border-outline-variant grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            {info.session_name && (
              <div className="flex items-start gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-on-surface-variant">Sesi</p>
                  <p className="font-medium text-on-surface truncate">{info.session_name}</p>
                </div>
              </div>
            )}
            {info?.session_date && (
              <div className="flex items-start gap-2">
                <CalendarDays className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-on-surface-variant">Tanggal</p>
                  <p className="font-medium text-on-surface">{formatDate(info.session_date)}</p>
                </div>
              </div>
            )}
            {info?.location && (
              <div className="flex items-start gap-2 min-w-0 sm:col-span-1">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs text-on-surface-variant">Lokasi</p>
                  <p className="font-medium text-on-surface truncate">{info.location}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Privacy banner */}
      <div className="bg-primary-container/60 rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant">
          Kami meminta izin Anda untuk merekam dan memotret selama kegiatan edutourism. Data
          hanya digunakan untuk laporan perkembangan anak dan{' '}
          <span className="font-medium text-on-surface">tidak disebarluaskan</span>.
        </p>
      </div>

      {/* Progress meter */}
      <div className="px-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-on-surface-variant">
            Kelengkapan persetujuan
          </span>
          <span className="text-xs font-semibold text-primary">{progressPct}%</span>
        </div>
        <div
          className="h-2 w-full rounded-full bg-surface-variant overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Recording consent */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
            <Mic className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-on-surface">Izin Rekaman</h3>
            <p className="text-xs text-on-surface-variant">Rekaman suara selama kegiatan</p>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant mt-3 mb-4">
          Rekaman digunakan untuk menilai perkembangan bicara dan interaksi anak selama kegiatan.
        </p>
        <YaTidakChoice
          label="Izin rekaman suara"
          value={recordingConsent}
          onChange={setRecordingConsent}
        />
      </Card>

      {/* Photo consent */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-9 h-9 rounded-xl bg-primary-50 text-primary flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-on-surface">Izin Foto</h3>
            <p className="text-xs text-on-surface-variant">Pengambilan foto selama kegiatan</p>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant mt-3 mb-4">
          Foto digunakan untuk dokumentasi kegiatan dan disertakan dalam laporan perkembangan anak.
        </p>
        <YaTidakChoice
          label="Izin foto"
          value={photoConsent}
          onChange={setPhotoConsent}
        />
      </Card>

      {/* Parent name */}
      <Input
        label="Nama Lengkap Anda"
        placeholder="Masukkan nama Anda sebagai orang tua/wali"
        value={parentName}
        onChange={(e) => setParentName(e.target.value)}
        error={!parentName.trim() ? 'Nama wajib diisi' : undefined}
        leftIcon={<User className="w-4 h-4" />}
      />

      {/* Submit */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSubmit}
        disabled={submitting}
        loading={submitting}
      >
        {!submitting && 'Kirim Persetujuan'}
      </Button>
    </div>
  )
}

/* ── Page wrapper with guard ── */
const ConsentFormPage = () => {
  return (
    <ParentTokenGuard kind="consent">
      <div className="min-h-screen bg-surface px-4 py-6 sm:py-10">
        <div className="mx-auto w-full max-w-xl">
          <ConsentForm />
        </div>
      </div>
    </ParentTokenGuard>
  )
}

export default ConsentFormPage
