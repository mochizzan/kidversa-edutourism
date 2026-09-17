import { useState, useRef, useCallback, useEffect } from 'react'
import { Star, Clipboard, ShieldX } from 'lucide-react'
import { cn } from '../../../core/utils'
import { Button } from '../../../shared/components/ui/Button'
import type { Assessment, CreateAssessmentDTO, SessionSubstage } from '../../../core/types'

interface KegiatanCardProps {
  kegiatan: SessionSubstage
  assessment?: Assessment
  kegiatanName: string
  participantId: string
  isMine: boolean
  onSave: (data: CreateAssessmentDTO) => Promise<void>
  isSavingGlobal: boolean
}

const RATING_LABELS: Record<number, string> = {
  0: 'Belum Dinilai',
  1: 'BB - Belum Berkembang',
  2: 'MB - Mulai Berkembang',
  3: 'BSH - Berkembang Sesuai Harapan',
  4: 'BSB - Berkembang Sangat Baik',
}

function StarRatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {[1, 2, 3, 4].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          className={cn(
            'p-1 rounded-lg transition-all duration-150',
            'hover:scale-110 active:scale-95',
            disabled && 'cursor-not-allowed opacity-60',
          )}
          aria-label={`Nilai ${star} bintang`}
        >
          <Star
            className={cn(
              'w-6 h-6 sm:w-7 sm:h-7 transition-colors',
              star <= value
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-gray-300 fill-transparent',
            )}
          />
        </button>
      ))}
      <span className="ml-2 text-sm font-medium text-gray-600">
        {RATING_LABELS[value] ?? `${value}/5`}
      </span>
    </div>
  )
}

export function KegiatanCard({
  kegiatan,
  assessment,
  kegiatanName,
  participantId,
  isMine,
  onSave,
  isSavingGlobal,
}: KegiatanCardProps) {
  const initialStar = useRef(assessment?.star_rating ?? 0)
  const initialComment = useRef(assessment?.comment ?? '')

  const [starRating, setStarRating] = useState(assessment?.star_rating ?? 0)
  const [comment, setComment] = useState(assessment?.comment ?? '')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset local state when assessment prop changes (e.g. after refresh)
  useEffect(() => {
    initialStar.current = assessment?.star_rating ?? 0
    initialComment.current = assessment?.comment ?? ''
    setStarRating(assessment?.star_rating ?? 0)
    setComment(assessment?.comment ?? '')
  }, [assessment])

  const isDirty =
    starRating !== initialStar.current ||
    comment !== initialComment.current

  const handleSave = useCallback(async () => {
    if (!isMine || !isDirty || isSavingGlobal || saving) return
    setSaving(true)
    try {
      await onSave({
        participant_id: participantId,
        session_id: kegiatan.session_id,
        session_substage_id: kegiatan.id,
        star_rating: starRating,
        comment: comment.trim() || undefined,
      })
      // After successful save, update initial values to match current state
      initialStar.current = starRating
      initialComment.current = comment
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      // Error is handled by parent via toast
    } finally {
      setSaving(false)
    }
  }, [starRating, comment, kegiatan, participantId, isMine, isDirty, isSavingGlobal, saving, onSave])

  const isSaving = saving || isSavingGlobal

  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm p-4 transition-colors relative',
        isDirty ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200 bg-white',
        !isMine && 'opacity-70',
      )}
    >
      {/* Dirty indicator dot */}
      {isDirty && (
        <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-amber-400" />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Clipboard className="w-4 h-4 text-gray-400 shrink-0" />
        <h3 className="font-semibold text-sm text-gray-900">{kegiatanName}</h3>
        {!isMine && (
          <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">
            <ShieldX className="w-3 h-3 inline mr-0.5 -mt-0.5" />
            Bukan kelompok Anda
          </span>
        )}
      </div>

      {/* Star rating */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Penilaian Bintang
        </label>
        <StarRatingInput
          value={starRating}
          onChange={setStarRating}
          disabled={!isMine || isSaving}
        />
      </div>

      {/* Comment */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Komentar
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tulis komentar tentang kegiatan ini..."
          maxLength={300}
          rows={3}
          disabled={!isMine || isSaving}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none resize-none transition-all disabled:opacity-60"
        />
        <p className="text-xs text-gray-400 mt-1 text-right">
          {comment.length}/300
        </p>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty || isSaving || !isMine}
          size="sm"
        >
          Simpan
        </Button>
        {saveSuccess && (
          <span className="text-sm text-green-600 font-medium animate-pulse">
            ✓ Tersimpan!
          </span>
        )}
      </div>
    </div>
  )
}
