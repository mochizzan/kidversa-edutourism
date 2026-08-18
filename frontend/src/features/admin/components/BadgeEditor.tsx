import { useRef, useState } from 'react'
import { Image, Loader2, Upload, X } from 'lucide-react'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { getMediaUrl } from '../../../core/utils/media'
import { uploadBadgeImage } from '../../../core/utils/badgeImage'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'

interface BadgeEditorProps {
  title: string
  name: string
  imageUrl: string
  onNameChange: (name: string) => void
  onImageChange: (imageUrl: string) => void
}

// Reusable badge editor: a name field plus an image picker that uploads the
// selected file and stores the returned id in `imageUrl` (displayed via
// getMediaUrl(kind "content")). Clearing the image stores an empty string.
export function BadgeEditor({
  title,
  name,
  imageUrl,
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
    <div className="space-y-3 border-t border-outline-variant pt-4">
      <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <Input
            label="Nama Badge"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Contoh: Penjelajah Berani"
          />
        </div>
        <div className="w-full sm:w-40 shrink-0">
          <label className="block text-sm font-medium text-on-surface mb-1">Gambar Badge</label>
          <div className="w-full aspect-square rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden border border-outline-variant relative">
            {imageUrl ? (
              <img
                src={getMediaUrl('content', imageUrl)}
                alt={name || 'badge'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <Image className="w-8 h-8 text-on-surface-variant/50" />
            )}
            {imageUrl && (
              <button
                type="button"
                onClick={() => onImageChange('')}
                className="absolute top-1 right-1 p-1 rounded-full bg-surface/80 text-on-surface hover:bg-surface"
                aria-label="Hapus gambar badge"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            icon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          >
            {uploading ? 'Mengunggah…' : 'Unggah Gambar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
