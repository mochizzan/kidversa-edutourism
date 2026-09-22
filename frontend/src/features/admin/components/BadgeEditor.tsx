import { useRef, useState } from 'react'
import { Award, Image, Loader2, Upload, X } from 'lucide-react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { getMediaUrl } from '../../../core/utils/media'
import { uploadBadgeImage } from '../../../core/utils/badgeImage'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'

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
  const { addToast } = useGlobalToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const id = await uploadBadgeImage(file)
      onImageChange(id)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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
            label="Nama Badge"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Contoh: Penjelajah Berani"
          />
        </div>
        <div className="w-full shrink-0">
          <span className="mb-1 block text-xs font-medium text-on-surface-variant">Gambar</span>
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
                onClick={() => onImageChange('')}
                className="absolute right-1 top-1 rounded-full bg-surface/80 p-1 text-on-surface hover:bg-surface"
                aria-label="Hapus gambar badge"
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
            disabled={uploading}
            icon={uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          >
            {uploading ? 'Mengunggah…' : 'Unggah Gambar'}
          </Button>
        </div>
      </div>
    </section>
  )
}
