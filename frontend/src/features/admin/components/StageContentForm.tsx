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

export interface StageContentFormValues {
  title: string
  file_url: string
  file_type: StageContentFileType
  duration_seconds: number
  is_active: boolean
}

interface StageContentFormProps {
  initial?: StageContent | null
  onSubmit: (data: StageContentFormValues) => void
  onCancel: () => void
}

const EMPTY: StageContentFormValues = {
  title: '',
  file_url: '',
  file_type: StageContentFileTypeEnum.VIDEO,
  duration_seconds: 0,
  is_active: true,
}

export function StageContentForm({ initial, onSubmit, onCancel }: StageContentFormProps) {
  const [form, setForm] = useState<StageContentFormValues>(
    initial
      ? {
          title: initial.title,
          file_url: initial.file_url,
          file_type: initial.file_type,
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

  const set = <K extends keyof StageContentFormValues>(key: K, value: StageContentFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

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

      const url = URL.createObjectURL(processedFile)
      set('file_url', url)
      set('file_type', detectedType)

      if (detectedType === StageContentFileTypeEnum.VIDEO || detectedType === StageContentFileTypeEnum.AUDIO) {
        const duration = await getMediaDuration(file)
        set('duration_seconds', duration)
      }
    } catch {
      setFileError('Gagal memproses file. Coba lagi.')
    } finally {
      setCompressing(false)
    }
  }, [])

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
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.file_url.trim()) {
      setFileError('File atau URL wajib diisi')
      return
    }
    onSubmit(form)
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
          set('file_type', e.target.value as StageContentFileType)
          set('file_url', '')
          setFileError(null)
        }}
        options={fileTypes}
        hint="Format media dari satu konten; boleh berbeda dari Tipe Aktivitas stage."
      />

      {isGameBundle ? (
        <Input
          label="URL File"
          value={form.file_url}
          onChange={(e) => set('file_url', e.target.value)}
          placeholder="https://..."
          required
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
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Durasi File (detik)"
          type="number"
          min={0}
          value={form.duration_seconds.toString()}
          onChange={(e) => set('duration_seconds', parseInt(e.target.value) || 0)}
          hint="Panjang pemutaran file ini (detik). Otomatis terisi untuk Video/Audio."
        />
      </div>

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
