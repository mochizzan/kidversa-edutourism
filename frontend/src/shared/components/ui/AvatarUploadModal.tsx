import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, ArrowRight } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { validateImageFile } from '../../../core/utils/image'
import { cn } from '../../../core/utils'
import { formatFileSize, truncate } from '../../../shared/utils'

interface AvatarUploadModalProps {
  open: boolean
  onClose: () => void
  currentAvatarUrl?: string
  initialFile?: File | null
  onUpload: (file: File) => Promise<void>
}

export function AvatarUploadModal({ open, onClose, currentAvatarUrl, initialFile = null, onUpload }: AvatarUploadModalProps) {
  const { t } = useTranslation()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  useEffect(() => {
    if (!open) return

    if (initialFile) {
      setSelectedFile(initialFile)
      setPreviewUrl(URL.createObjectURL(initialFile))
    } else {
      setSelectedFile(null)
      setPreviewUrl(null)
    }
    setDragOver(false)
    setUploading(false)

  }, [open, initialFile])

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const error = validateImageFile(file)
    if (error) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items?.length > 0) setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current = 0
    setDragOver(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setUploading(true)
    try {
      await onUpload(selectedFile)
      onClose()
    } catch {
      // consumer handles toast; stay in preview for retry
    } finally {
      setUploading(false)
    }
  }

  const handleClose = useCallback(() => {
    if (!uploading) onClose()
  }, [uploading, onClose])

  const title = currentAvatarUrl ? t('common.avatar.changeTitle') : t('common.avatar.addTitle')

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      closeOnOverlay={!uploading}
      footer={selectedFile ? (
        <div className="flex justify-end gap-3">
          <Button variant="ghost" disabled={uploading} onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={uploading} onClick={handleSave}>{t('common.save')}</Button>
        </div>
      ) : undefined}
    >
      {!selectedFile ? (
        <div
          tabIndex={0}
          role="button"
          aria-label={t('common.avatar.pickAria')}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
            'hover:border-primary hover:bg-primary-container/10',
            dragOver ? 'border-primary bg-primary-container/20' : 'border-outline-variant'
          )}
        >
          <Upload className="w-12 h-12 mx-auto mb-3 text-outline" />
          <p className="text-sm font-medium text-on-surface mb-1">
            {t('common.avatar.dropHint')}
          </p>
          <p className="text-xs text-on-surface-variant">{t('common.avatar.limits')}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="absolute m-0 h-px w-px opacity-0"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div className="space-y-4 transition-all duration-200 animate-fadeIn">
          <div className="flex items-center justify-center gap-4">
            {currentAvatarUrl && (
              <div className="text-center">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-outline-variant mx-auto">
                  <img src={currentAvatarUrl} alt={t('common.avatar.current')} className="w-full h-full object-cover" />
                </div>
                <p className="text-xs font-semibold text-on-surface-variant mt-2">{t('common.avatar.current')}</p>
              </div>
            )}
            {currentAvatarUrl && (
              <ArrowRight className="w-5 h-5 text-on-surface-variant shrink-0" />
            )}
            <div className="text-center">
              <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-primary mx-auto">
                <img src={previewUrl!} alt={t('common.avatar.previewAlt')} className="w-full h-full object-cover" />
              </div>
              <p className="text-xs font-semibold text-primary mt-2">{t('common.avatar.new')}</p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-surface-container-low rounded-lg px-4 py-2.5">
            <span className="text-sm font-medium text-on-surface truncate max-w-[200px]">
              {truncate(selectedFile.name, 24)}
            </span>
            <span className="text-xs text-on-surface-variant shrink-0 ml-2">
              {formatFileSize(selectedFile.size)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
            className="text-primary text-sm font-semibold hover:underline cursor-pointer"
          >
            {t('common.avatar.changeFile')}
          </button>
        </div>
      )}
    </Modal>
  )
}
