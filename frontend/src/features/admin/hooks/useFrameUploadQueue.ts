import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { frameService } from '../../../core/services/frames'
import { ROUTES } from '../../../core/constants/app'
import { getTenantScope } from '../../../core/services/tenantScope'

interface UploadItem {
  id: string
  file: File
  preview: string
  name: string
  programId: string
}

interface UseFrameUploadQueueResult {
  items: UploadItem[]
  warnings: string[]
  errorMessage: string | null
  isSaving: boolean
  hasEmptyName: boolean
  clearWarnings: () => void
  clearErrorMessage: () => void
  processFiles: (fileList: FileList | File[]) => void
  handleRemove: (id: string) => void
  handleUpdateName: (id: string, name: string) => void
  handleUpdateProgram: (id: string, programId: string) => void
  handleReplaceImage: (id: string) => void
  handleClearAll: () => void
  handleSaveAll: () => Promise<void>
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function formatItemName(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function useFrameUploadQueue(): UseFrameUploadQueueResult {
  const navigate = useNavigate()
  const [items, setItems] = useState<UploadItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const previewUrlsRef = useRef<Set<string>>(new Set())

  // Revoke all remaining object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      previewUrlsRef.current.clear()
    }
  }, [])

  const processFiles = useCallback((fileList: FileList | File[]) => {
    setItems((currentItems) => {
      const seenInBatch = new Set<string>()
      const existingKeys = new Set(currentItems.map((i) => `${i.file.name}-${i.file.size}`))
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
        batch.push({ id: generateId(), file, preview, name: formatItemName(file.name), programId: '' })
      })

      if (msgs.length > 0) {
        setWarnings((prev) => [...prev, ...msgs])
      }
      return [...currentItems, ...batch]
    })
  }, [])

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

  const handleClearAll = useCallback(() => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrlsRef.current.clear()
    setItems([])
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (items.length === 0) return
    if (items.some((i) => !i.name.trim())) return

    const scope = getTenantScope()
    if (scope.blocked || !scope.tenantId) {
      setErrorMessage('Pilih tenant aktif terlebih dahulu.')
      return
    }

    const tenantId = scope.tenantId
    setIsSaving(true)
    setErrorMessage(null)
    try {
      await Promise.all(
        items.map((item, index) =>
          frameService.create({
            tenant_id: tenantId, name: item.name.trim(),
            program_id: item.programId || undefined,
            file_url: item.preview, is_active: true, sort_order: index,
          }),
        ),
      )
      navigate(ROUTES.ADMIN.FRAMES)
    } catch {
      setErrorMessage('Gagal menyimpan frame. Silakan coba lagi.')
    } finally {
      setIsSaving(false)
    }
  }, [items, navigate])

  const hasEmptyName = items.some((i) => !i.name.trim())

  return {
    items, warnings, errorMessage, isSaving, hasEmptyName,
    clearWarnings: () => setWarnings([]),
    clearErrorMessage: () => setErrorMessage(null),
    processFiles, handleRemove, handleUpdateName, handleUpdateProgram,
    handleReplaceImage, handleClearAll, handleSaveAll,
  }
}
