import { useEffect, useRef, useState } from 'react'
import { Award, Check, Image, Loader2, Upload, X } from 'lucide-react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { getMediaUrl } from '../../../core/utils/media'
import { uploadBadgeImage, BADGE_UPLOAD_TIMEOUT_MS } from '../../../core/utils/badgeImage'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useTranslation } from 'react-i18next'

type BadgeEditorVariant = 'subtopik' | 'final'

interface BadgeEditorProps {
  title: string
  /** Drives the tier chip color so the two editors read as distinct levels. */
  variant?: BadgeEditorVariant
  name: string
  imageUrl: string
  /** Explains when the award is granted — resolves the two-tier ambiguity. */
  helperText?: string
  onNameChange: (name: string) => void
  onImageChange: (imageUrl: string) => void
}

// Tier chip colors: SubTopik uses the primary accent; the capstone Final
// Program badge uses the tertiary accent to signal the higher level.
const VARIANT_CHIP: Record<BadgeEditorVariant, string> = {
  subtopik: 'bg-primary-container text-primary',
  final: 'bg-tertiary-container text-on-tertiary-container',
}

// Reusable badge editor: a named, framed medallion preview plus an uploader.
// The frame + tier chip make the Topik vs Program editors visibly different
// tiers, and `helperText` states when the child actually earns the award.
export function BadgeEditor({
  title,
  variant = 'subtopik',
  name,
  imageUrl,
  helperText,
  onNameChange,
  onImageChange,
}: BadgeEditorProps) {
  const { t } = useTranslation()
  const { addToast } = useGlobalToast()
  const fileRef = useRef<HTMLInputElement>(null)
  // D4 state machine: idle → uploading (real XHR transfer percent) →
  // retrying (honest attempt n/max) → success ONLY after a valid server
  // response with content.id. A failure surfaces as a toast and returns the
  // state to idle so the button is usable again.
  const [status, setStatus] = useState<'idle' | 'uploading' | 'retrying' | 'success'>('idle')
  const [percent, setPercent] = useState<number | null>(null)
  const [retry, setRetry] = useState<{ attempt: number; max: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Abort the in-flight upload on unmount — no state updates or toasts from a
  // component that is gone.
  useEffect(() => () => abortRef.current?.abort(), [])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('uploading')
    setPercent(null)
    setRetry(null)
    try {
      const id = await uploadBadgeImage(file, {
        signal: controller.signal,
        timeoutMs: BADGE_UPLOAD_TIMEOUT_MS,
        onProgress: setPercent,
        onRetry: (attempt, max) => {
          setRetry({ attempt, max })
          setStatus('retrying')
        },
      })
      onImageChange(id)
      setStatus('success')
    } catch (err) {
      // Abort = deliberate cancellation (unmount), not a user-facing failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        addToast({ type: 'error', message: friendlyError(err) })
      }
      setStatus('idle')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const busy = status === 'uploading' || status === 'retrying'
  const uploadLabel = () => {
    if (status === 'retrying' && retry) return t('admin.badge.uploadRetry', retry)
    if (status === 'uploading') {
      return percent === null
        ? t('admin.badge.uploading')
        : t('admin.badge.uploadingPercent', { percent })
    }
    if (status === 'success') return t('admin.badge.uploadSuccess')
    return t('admin.badge.uploadBtn')
  }

  return (
    <section className="rounded-2xl border border-outline-variant bg-surface-container-low/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${VARIANT_CHIP[variant]}`}>
          <Award className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
          {helperText && (
            <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">{helperText}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_11rem] sm:items-center">
        <div>
          <Input
            label={t('admin.badge.nameLabel')}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('admin.badge.namePlaceholder')}
          />
        </div>
        <div className="relative w-full shrink-0">
          <span className="mb-1 block text-xs font-medium text-on-surface-variant">{t('admin.badge.imageLabel')}</span>
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface shadow-sm ring-1 ring-inset ring-black/5">
            {imageUrl ? (
              <img
                src={getMediaUrl('content', imageUrl)}
                alt={name || 'badge'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  ; (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Image className="h-8 w-8 text-on-surface-variant/50" />
              </div>
            )}
            {imageUrl && (
              <button
                type="button"
                onClick={() => {
                  onImageChange('')
                  setStatus('idle')
                }}
                className="absolute right-1 top-1 rounded-full bg-surface/80 p-1 text-on-surface hover:bg-surface"
                aria-label={t('admin.badge.removeImageAria')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="absolute m-0 h-px w-px opacity-0"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            icon={
              busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status === 'success' ? (
                <Check className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )
            }
          >
            {uploadLabel()}
          </Button>
        </div>
      </div>
    </section>
  )
}
