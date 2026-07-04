import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Image, Trash2, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { frameService } from '../../../core/services/frames'
import { programService } from '../../../core/services/programs'
import { cn } from '../../../core/utils'
import type { Program } from '../../../core/types'

// --- Types ---

interface UploadItem {
  id: string
  file: File
  preview: string
  name: string
  programId: string
}

// --- Helpers ---

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function formatItemName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// --- Constants ---

const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

// --- Component ---

const FrameUploadPage = () => {
  const navigate = useNavigate()

  const [items, setItems] = useState<UploadItem[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())

  // Fetch programs for the Select dropdown
  useEffect(() => {
    programService
      .getAll({ limit: 100 })
      .then((res) => setPrograms(res.data))
      .catch(() => {
        // silently fail — the dropdown will just show "Semua Program"
      })
  }, [])

  // Revoke all remaining object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrlsRef.current.clear()
    }
  }, [])

  // ---- File processing ----

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      const seenInBatch = new Set<string>()
      const existingKeys = new Set(items.map((i) => `${i.file.name}-${i.file.size}`))
      const batch: UploadItem[] = []
      const msgs: string[] = []

      Array.from(fileList).forEach((file) => {
        const key = `${file.name}-${file.size}`

        if (!ACCEPTED_TYPES.includes(file.type)) {
          msgs.push(`"${file.name}" bukan file PNG/JPEG.`)
          return
        }
        if (file.size > MAX_FILE_SIZE) {
          msgs.push(`"${file.name}" melebihi batas 2 MB.`)
          return
        }
        if (existingKeys.has(key) || seenInBatch.has(key)) {
          msgs.push(`"${file.name}" sudah ada dan dilewati.`)
          return
        }

        seenInBatch.add(key)
        const preview = URL.createObjectURL(file)
        previewUrlsRef.current.add(preview)
        batch.push({
          id: generateId(),
          file,
          preview,
          name: formatItemName(file.name),
          programId: '',
        })
      })

      if (msgs.length > 0) {
        setWarnings((prev) => [...prev, ...msgs])
      }
      if (batch.length > 0) {
        setItems((prev) => [...prev, ...batch])
      }
    },
    [items],
  )

  // ---- Drag / click zone ----

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
      }
      // Reset so the same file can be picked again after removal
      e.target.value = ''
    },
    [processFiles],
  )

  // ---- Item mutations ----

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target) {
        previewUrlsRef.current.delete(target.preview)
        URL.revokeObjectURL(target.preview)
      }
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const handleUpdateName = useCallback((id: string, name: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)))
  }, [])

  const handleUpdateProgram = useCallback((id: string, programId: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, programId } : i)))
  }, [])

  const handleReplaceImage = useCallback((id: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setWarnings((prev) => [...prev, `"${file.name}" bukan file PNG/JPEG.`])
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setWarnings((prev) => [...prev, `"${file.name}" melebihi batas 2 MB.`])
        return
      }

      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          previewUrlsRef.current.delete(item.preview)
          URL.revokeObjectURL(item.preview)
          const preview = URL.createObjectURL(file)
          previewUrlsRef.current.add(preview)
          return { ...item, file, preview }
        }),
      )
    }
    input.click()
  }, [])

  // ---- Bulk actions ----

  const handleClearAll = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
    setItems([])
    setShowClearConfirm(false)
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (items.length === 0) return
    if (items.some((i) => !i.name.trim())) return

    setIsSaving(true)
    setErrorMessage(null)

    try {
      await Promise.all(
        items.map((item, index) =>
          frameService.create({
            tenant_id: 't-1',
            name: item.name.trim(),
            program_id: item.programId || undefined,
            file_url: item.preview,
            is_active: true,
            sort_order: index,
          }),
        ),
      )
      navigate('/admin/frames')
    } catch {
      setErrorMessage('Gagal menyimpan frame. Silakan coba lagi.')
    } finally {
      setIsSaving(false)
    }
  }, [items, navigate])

  // ---- Derived ----

  const hasEmptyName = items.some((i) => !i.name.trim())
  const programOptions = [
    { value: '', label: 'Semua Program' },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ]

  // ---- Render ----

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Frame"
        breadcrumbs={[
          { label: 'Frames', href: '/admin/frames' },
          { label: 'Upload Frame' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setShowClearConfirm(true)}
              disabled={items.length === 0}
            >
              Hapus Semua
            </Button>
            <Button
              icon={<Upload className="h-4 w-4" />}
              onClick={handleSaveAll}
              disabled={items.length === 0 || hasEmptyName}
              loading={isSaving}
            >
              Simpan Semua
            </Button>
          </div>
        }
      />

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-error-container/20 p-4 text-sm text-error">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="font-medium hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Warning banner */}
      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            {warnings.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
          <button
            onClick={() => setWarnings([])}
            className="shrink-0 font-medium hover:underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'cursor-pointer rounded-2xl border-2 border-dashed border-outline-variant p-12 text-center',
          'transition-colors hover:border-primary hover:bg-primary-container/10',
        )}
      >
        <Upload className="mx-auto mb-3 h-12 w-12 text-on-surface-variant" />
        <p className="text-base text-on-surface-variant">
          Seret &amp; lepas gambar atau klik untuk memilih
        </p>
        <p className="mt-1 text-sm text-on-surface-variant/60">
          PNG atau JPEG, maksimal 2MB per file
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Queue grid / empty */}
      {items.length === 0 ? (
        <EmptyState
          icon={<Image className="h-16 w-16" />}
          title="Belum ada frame"
          description="Seret dan lepas gambar di atas untuk memulai upload."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} padding="sm" className="space-y-3">
              {/* Preview */}
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-surface-container-high">
                <img
                  src={item.preview}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Fields */}
              <div className="space-y-3">
                <Input
                  label="Nama Frame"
                  value={item.name}
                  onChange={(e) => handleUpdateName(item.id, e.target.value)}
                  required
                />
                <Select
                  label="Program"
                  value={item.programId}
                  onChange={(e) => handleUpdateProgram(item.id, e.target.value)}
                  options={programOptions}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className="h-4 w-4" />}
                  onClick={() => handleReplaceImage(item.id)}
                >
                  Ganti Gambar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="h-4 w-4" />}
                  onClick={() => handleRemove(item.id)}
                >
                  Hapus
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Clear confirmation modal */}
      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Hapus Semua Frame"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleClearAll}>
              Hapus Semua
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin menghapus semua frame dari antrean? Tindakan ini tidak
          dapat dibatalkan.
        </p>
      </Modal>
    </div>
  )
}

export default FrameUploadPage
