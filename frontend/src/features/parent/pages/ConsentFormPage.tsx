import { useState } from 'react'
import {
  CheckCircle,
  Camera,
  Mic,
  User,
  Shield,
  Loader2,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { consentService } from '../../../core/services/consent'
import { cn } from '../../../core/utils/cn'

/* ── Inner form component (inside guard) ── */
function ConsentForm() {
  const { participant, token } = useParentToken()

  const [recordingConsent, setRecordingConsent] = useState<boolean | null>(
    participant?.consent_recording ?? null
  )
  const [photoConsent, setPhotoConsent] = useState<boolean | null>(
    participant?.consent_photo ?? null
  )
  const [parentName, setParentName] = useState(participant?.parent_name || '')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const { addToast } = useGlobalToast()

  const handleSubmit = async () => {
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
      // Check if already submitted
      if (participant?.consent_at && !success) {
        setAlreadySubmitted(true)
        setSubmitting(false)
        return
      }

      await consentService.submit(token, recordingConsent, photoConsent)
      setSuccess(true)
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'INVALID_TOKEN'
          ? 'Tautan tidak valid. Silakan hubungi koordinator.'
          : 'Gagal mengirim persetujuan. Silakan coba lagi.'
      addToast({ type: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Already submitted (show existing values) ── */
  if (alreadySubmitted || (participant?.consent_at && !success)) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-on-primary-container" />
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">
          Persetujuan Sudah Dikirim
        </h2>
        <p className="text-sm text-on-surface-variant mb-6">
          Persetujuan untuk <strong>{participant?.child_name}</strong> sudah diterima sebelumnya.
        </p>

        <div className="space-y-3 text-left max-w-sm mx-auto">
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-variant">
            <span className="text-sm">Izin Rekaman</span>
            <span
              className={cn(
                'text-sm font-medium',
                participant?.consent_recording ? 'text-green-600' : 'text-error'
              )}
            >
              {participant?.consent_recording ? 'Ya' : 'Tidak'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-variant">
            <span className="text-sm">Izin Foto</span>
            <span
              className={cn(
                'text-sm font-medium',
                participant?.consent_photo ? 'text-green-600' : 'text-error'
              )}
            >
              {participant?.consent_photo ? 'Ya' : 'Tidak'}
            </span>
          </div>
          {participant?.consent_at && (
            <p className="text-xs text-on-surface-variant text-center">
              Dikirim pada{' '}
              {new Date(participant.consent_at).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      </div>
    )
  }

  /* ── Success ── */
  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-on-surface mb-2">
          Terima Kasih!
        </h2>
        <p className="text-sm text-on-surface-variant mb-2">
          Persetujuan untuk <strong>{participant?.child_name}</strong> berhasil dikirim.
        </p>
        <p className="text-xs text-on-surface-variant">
          Koordinator akan memproses data partisipasi buah hati Anda.
        </p>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div className="space-y-6">
      {/* Child info */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
            <User className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">{participant?.child_name}</h2>
            <p className="text-sm text-on-surface-variant">
              {participant?.school_name || 'Belum terdaftar'} | {participant?.child_age} tahun
            </p>
          </div>
        </div>
      </Card>

      {/* Info banner */}
      <div className="bg-primary-container/50 rounded-2xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant">
          Kami meminta izin Anda untuk merekam dan mengambil foto selama kegiatan edutourism. Data
          hanya digunakan untuk keperluan laporan perkembangan anak dan tidak akan disebarluaskan.
        </p>
      </div>

      {/* Recording consent */}
      <Card title="Izin Rekaman" subtitle="Rekaman suara selama kegiatan">
        <p className="text-sm text-on-surface-variant mb-4">
          Rekaman digunakan untuk menilai perkembangan bicara dan interaksi anak selama kegiatan.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setRecordingConsent(true)}
            className={cn(
              'flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all',
              recordingConsent === true
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-outline-variant text-on-surface-variant hover:border-on-surface-variant'
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Ya, Setuju
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRecordingConsent(false)}
            className={cn(
              'flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all',
              recordingConsent === false
                ? 'border-error bg-error-container text-on-error-container'
                : 'border-outline-variant text-on-surface-variant hover:border-on-surface-variant'
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <Mic className="w-4 h-4" /> Tidak
            </span>
          </button>
        </div>
      </Card>

      {/* Photo consent */}
      <Card title="Izin Foto" subtitle="Pengambilan foto selama kegiatan">
        <p className="text-sm text-on-surface-variant mb-4">
          Foto digunakan untuk dokumentasi kegiatan dan disertakan dalam laporan perkembangan anak.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setPhotoConsent(true)}
            className={cn(
              'flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all',
              photoConsent === true
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-outline-variant text-on-surface-variant hover:border-on-surface-variant'
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Ya, Setuju
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPhotoConsent(false)}
            className={cn(
              'flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all',
              photoConsent === false
                ? 'border-error bg-error-container text-on-error-container'
                : 'border-outline-variant text-on-surface-variant hover:border-on-surface-variant'
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <Camera className="w-4 h-4" /> Tidak
            </span>
          </button>
        </div>
      </Card>

      {/* Parent name */}
      <Input
        label="Nama Lengkap Anda"
        placeholder="Masukkan nama Anda sebagai orang tua/wali"
        value={parentName}
        onChange={(e) => setParentName(e.target.value)}
        error={!parentName.trim() ? 'Nama wajib diisi' : undefined}
      />

      {/* Submit */}
      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengirim...</>
        ) : (
          'Kirim Persetujuan'
        )}
      </Button>
    </div>
  )
}

/* ── Page wrapper with guard ── */
const ConsentFormPage = () => {
  return (
    <ParentTokenGuard>
      <ConsentForm />
    </ParentTokenGuard>
  )
}

export default ConsentFormPage
