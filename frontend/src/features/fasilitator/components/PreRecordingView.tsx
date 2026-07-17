import { AlertTriangle, MonitorSmartphone } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import type { Participant } from '../../../core/types'

interface PreRecordingViewProps {
  participant: Participant
  isBrowserSupported: boolean
  isSaving: boolean
  onStart: () => void
}

export const PreRecordingView = ({
  participant,
  isBrowserSupported,
  isSaving,
  onStart,
}: PreRecordingViewProps) => (
  <div className="flex-1 flex flex-col bg-surface text-on-surface overflow-y-auto">
    <div className="flex-1 p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-2xl font-bold text-primary shrink-0">
          {participant.child_name.charAt(0)}
        </div>
        <div>
          <h2 className="text-xl font-bold">{participant.child_name}</h2>
          <p className="text-sm text-on-surface-variant">Usia: {participant.child_age} tahun</p>
        </div>
      </div>

      <div className="bg-primary-container rounded-2xl p-5">
        <p className="text-sm text-primary/60 font-medium mb-2">Pertanyaan Refleksi</p>
        <p className="text-lg font-semibold text-primary">"Apa yang paling kamu suka hari ini?"</p>
      </div>

      <div className="flex items-start gap-3 bg-surface-container-low rounded-2xl p-4">
        <MonitorSmartphone className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-on-surface">Tips Perekaman</p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Arahkan kamera belakang ke wajah anak agar ekspresi terekam dengan jelas. Pastikan
            pencahayaan cukup dan suara latar tidak terlalu bising.
          </p>
        </div>
      </div>

      {!participant.consent_recording && (
        <div className="bg-error-container rounded-2xl p-5 text-center">
          <AlertTriangle className="w-10 h-10 text-error mx-auto mb-3" />
          <h3 className="font-semibold text-on-error-container mb-1">Izin Rekaman Belum Ada</h3>
          <p className="text-sm text-on-error-container/70">
            Orang tua/wali {participant.child_name} belum memberikan izin untuk perekaman video.
            Rekaman tidak dapat dilakukan tanpa izin.
          </p>
        </div>
      )}

      {!isBrowserSupported && (
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-5 text-center">
          <AlertTriangle className="w-10 h-10 text-warning mx-auto mb-3" />
          <h3 className="font-semibold text-warning mb-1">Browser Tidak Didukung</h3>
          <p className="text-sm text-on-surface-variant">
            Browser Anda tidak mendukung perekaman video. Gunakan Chrome, Firefox, atau Edge versi
            terbaru.
          </p>
        </div>
      )}
    </div>

    <div className="shrink-0 px-6 py-4 border-t border-outline-variant bg-surface">
      <Button
        className="w-full"
        size="lg"
        disabled={!participant.consent_recording || !isBrowserSupported || isSaving}
        onClick={onStart}
        icon={<span className="w-3 h-3 rounded-full bg-white inline-block" />}
      >
        MULAI REKAM
      </Button>
      {!participant.consent_recording && (
        <p className="text-[11px] text-on-surface-variant text-center mt-2">
          Izin rekaman diperlukan untuk memulai
        </p>
      )}
    </div>
  </div>
)
