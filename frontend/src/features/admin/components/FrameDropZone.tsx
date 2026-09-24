import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../../core/utils'
import { useTranslation } from 'react-i18next'

interface FrameDropZoneProps {
  onFilesSelected: (fileList: FileList) => void
}

export function FrameDropZone({ onFilesSelected }: FrameDropZoneProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (e.dataTransfer.files.length > 0) onFilesSelected(e.dataTransfer.files)
  }
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) onFilesSelected(e.target.files)
    e.target.value = ''
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'relative cursor-pointer rounded-2xl border-2 border-dashed border-outline-variant p-12 text-center',
        'transition-colors hover:border-primary hover:bg-primary-container/10',
      )}
    >
      <Upload className="mx-auto mb-3 h-12 w-12 text-on-surface-variant" />
      <p className="text-base text-on-surface-variant">{t('admin.frames.dropzoneText')}</p>
      <p className="mt-1 text-sm text-on-surface-variant/60">{t('admin.frames.dropzoneHint')}</p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        className="absolute m-0 h-px w-px opacity-0"
        onChange={handleFileSelect}
      />
    </div>
  )
}
