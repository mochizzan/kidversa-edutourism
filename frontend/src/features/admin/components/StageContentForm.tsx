import { useState, useRef, useCallback } from 'react'
import { Upload, X } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Button } from '../../../shared/components/ui/Button'
import { cn } from '../../../core/utils/cn'
import type { StageContent, StageContentFileType } from '../../../core/types'
import { StageContentFileType as StageContentFileTypeEnum } from '../../../core/types'
import { STAGE_CONTENT_FILE_TYPE_LABELS } from '../../../core/constants/labels'
import { CONTENT_MAX_FILE_SIZES, CONTENT_FILE_ACCEPT } from '../../../core/constants/content'
import { autoDetectFileType, getMediaDuration } from '../../../core/utils/content'

const fileTypes = Object.values(StageContentFileTypeEnum).map((value) => ({
  value,
  label: STAGE_CONTENT_FILE_TYPE_LABELS[value as StageContentFileType],
}))

export type StageContentSourceMode = 'upload' | 'youtube'

export interface StageContentFormValues {
  title: string
  file_url: string
  file_type: StageContentFileType
  /** YouTube watch/embed URL; only used when file_type === VIDEO && source_mode === 'youtube'. */
  youtube_url: string
  /** Client-only toggle: how a VIDEO is sourced. Never sent to the backend. */
  source_mode: StageContentSourceMode
  duration_seconds: number
  is_active: boolean
}

interface StageContentFormProps {
  initial?: StageContent | null
  onSubmit: (data: StageContentFormValues, file: File | null) => void
  onCancel: () => void
}

const EMPTY: StageContentFormValues = {
  title: '',
  file_url: '',
  file_type: StageContentFileTypeEnum.VIDEO,
  youtube_url: '',
  source_mode: 'upload',
  duration_seconds: 0,
  is_active: true,
}

export function StageContentForm({ initial, onSubmit, onCancel }: StageContentFormProps) {
  const [form, setForm] = useState<StageContentFormValues>(
    initial
      ? {
          title: initial.title,
          file_url: initial.file_url,
          youtube_url: initial.youtube_url ?? '',
          file_type: initial.file_type,
          // A VIDEO carrying a youtube_url is a YouTube source; otherwise it's an upload.
          source_mode:
            initial.file_type === StageContentFileTypeEnum.VIDEO && initial.youtube_url
              ? 'youtube'
              : 'upload',
          duration_seconds: initial.duration_seconds ?? 0,
          is_active: initial.is_active,
        }
      : EMPTY
  )

  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounter = useRef(0)
  // The actual File to upload (separate from the local blob preview URL).
  const uploadFileRef = useRef<File | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const set = <K extends keyof StageContentFormValues>(key: K, value: StageContentFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  const handleFileSelect = useCallback(async (file: File) => {
    setFileError(null)
    const detectedType = autoDetectFileType(file)

    if (detectedType === StageContentFileTypeEnum.GAME_BUNDLE) {
      setFileError('Tipe file tidak didukung. Gunakan URL untuk Game Bundle.')
      return
    }

    const maxSize = CONTENT_MAX_FILE_SIZES[detectedType]
    if (file.size > maxSize) {
      const limitMB = Math.round(maxSize / (1024 * 1024))
      setFileError(
        detectedType === StageContentFileTypeEnum.IMAGE
          ? 'Gambar melebihi batas 10 MB'
          : detectedType === StageContentFileTypeEnum.AUDIO
            ? 'File melebihi batas 50 MB'
            : `File melebihi batas ${limitMB} MB`
      )
      return
    }

    if (
      detectedType === StageContentFileTypeEnum.IMAGE &&
      file.type === 'image/gif' &&
      file.size > CONTENT_MAX_FILE_SIZES.IMAGE
    ) {
      setFileError('GIF tidak dapat dikompresi otomatis')
      return
    }

    try {
      let processedFile = file
      if (
        detectedType === StageContentFileTypeEnum.IMAGE &&
        file.type !== 'image/gif' &&
        file.size > CONTENT_MAX_FILE_SIZES.IMAGE
      ) {
        setCompressing(true)
        processedFile = await imageCompression(file, {
          maxSizeMB: 10,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/jpeg',
        })
      }

      // Keep the processed file for upload; only use a blob URL locally for preview.
      uploadFileRef.current = processedFile
      revokePreview()
      const url = URL.createObjectURL(processedFile)
      previewUrlRef.current = url
      set('file_url', url)
      set('file_type', detectedType)
      // Selecting a file means manual upload (not YouTube). Clear any stale YouTube state.
      set('source_mode', 'upload')
      set('youtube_url', '')

      // Duration is computed automatically for uploaded VIDEO only (backend also
      // probes it authoritatively on upload). AUDIO has no duration field of its own.
      if (detectedType === StageContentFileTypeEnum.VIDEO) {
        const duration = await getMediaDuration(file)
        set('duration_seconds', duration)
      }
    } catch {
      setFileError('Gagal memproses file. Coba lagi.')
    } finally {
      setCompressing(false)
    }
  }, [revokePreview])

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFileSelect(file)
  }

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current += 1
    setDragOver(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDragOver(false)
    }
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const clearFile = () => {
    set('file_url', '')
    setFileError(null)
    uploadFileRef.current = null
    revokePreview()
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // VIDEO + YouTube: send the URL, no file.
    if (form.file_type === StageContentFileTypeEnum.VIDEO && form.source_mode === 'youtube') {
      if (!form.youtube_url.trim()) {
        setFileError('URL YouTube wajib diisi')
        return
      }
      onSubmit({ ...form, file_url: '' }, null)
      return
    }

    // Everything else requires a file (or a Game Bundle URL).
    if (!form.file_url.trim()) {
      setFileError(form.file_type === StageContentFileTypeEnum.GAME_BUNDLE ? 'URL wajib diisi' : 'File wajib diisi')
      return
    }
    onSubmit(form, uploadFileRef.current)
  }

  const isGameBundle = form.file_type === StageContentFileTypeEnum.GAME_BUNDLE

  return (
    <form className="p-4 bg-surface-container-low rounded-xl space-y-3" onSubmit={handleSubmit}>
      <Input
        label="Judul"
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Judul konten"
        required
      />

      <Select
        label="Tipe File"
        value={form.file_type}
        onChange={(e) => {
          const nextType = e.target.value as StageContentFileType
          set('file_type', nextType)
          set('file_url', '')
          set('youtube_url', '')
          // YouTube source only applies to VIDEO; fall back to upload for other types.
          set('source_mode', nextType === StageContentFileTypeEnum.VIDEO ? form.source_mode : 'upload')
          setFileError(null)
        }}
        options={fileTypes}
        hint="Format media dari satu konten; boleh berbeda dari Tipe Aktivitas stage."
      />

      {form.file_type === StageContentFileTypeEnum.VIDEO && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-surface rounded-lg border border-outline-variant">
          <span className="text-sm text-on-surface-variant">Sumber Video:</span>
          <button
            type="button"
            onClick={() => set('source_mode', 'upload')}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium transition-colors',
              form.source_mode === 'upload'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-variant text-on-surface-variant hover:bg-outline-variant'
            )}
          >
            Upload Manual
          </button>
          <button
            type="button"
            onClick={() => {
              set('source_mode', 'youtube')
              set('file_url', '')
              set('duration_seconds', 0)
              uploadFileRef.current = null
              revokePreview()
            }}
            className={cn(
              'px-3 py-1 rounded-full text-sm font-medium transition-colors',
              form.source_mode === 'youtube'
                ? 'bg-primary text-on-primary'
                : 'bg-surface-variant text-on-surface-variant hover:bg-outline-variant'
            )}
          >
            YouTube
          </button>
        </div>
      )}

      {isGameBundle ? (
        <Input
          label="URL File"
          value={form.file_url}
          onChange={(e) => set('file_url', e.target.value)}
          placeholder="https://..."
          required
        />
      ) : form.file_type === StageContentFileTypeEnum.VIDEO && form.source_mode === 'youtube' ? (
        <Input
          label="URL YouTube"
          value={form.youtube_url}
          onChange={(e) => set('youtube_url', e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          required
          hint="Tempel tautan YouTube (watch / youtu.be / embed). Kiosk akan menampilkan via embed."
        />
      ) : (
        <div className="space-y-2">
          <span className="block text-sm font-medium text-on-surface mb-1">File</span>
          {form.file_url ? (
            <div className="flex items-center justify-between p-3 bg-surface rounded-lg border border-outline-variant">
              <span className="text-sm text-on-surface truncate">{form.file_url.split('/').pop()}</span>
              <button
                type="button"
                onClick={clearFile}
                className="text-on-surface-variant hover:text-error ml-2 shrink-0"
                aria-label="Hapus file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openFilePicker()
                }
              }}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              className={cn(
                'flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer',
                'text-on-surface-variant hover:border-primary hover:text-primary transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-primary-container',
                dragOver ? 'border-primary text-primary bg-primary-container/30' : 'border-outline-variant',
                compressing && 'pointer-events-none opacity-60'
              )}
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm text-center">
                {compressing ? 'Memproses...' : 'Seret file ke sini atau klik untuk pilih'}
              </span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={CONTENT_FILE_ACCEPT}
            onChange={onFileInputChange}
            className="hidden"
          />
          {fileError && <p className="text-sm text-error">{fileError}</p>}

          {form.file_type === StageContentFileTypeEnum.VIDEO && form.duration_seconds > 0 && (
            <p className="text-sm text-on-surface-variant">
              Total Durasi Video: {form.duration_seconds}(detik)
            </p>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => set('is_active', e.target.checked)}
          className="rounded"
        />
        Aktif
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={compressing}>
          {initial ? 'Simpan' : 'Tambah'}
        </Button>
        {initial && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </form>
  )
}
