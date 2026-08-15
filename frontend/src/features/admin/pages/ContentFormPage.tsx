import { useState, useEffect, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { ArrowLeft, Loader2, Upload, Link2, Video } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Select } from '../../../shared/components/ui/Select'
import { Input } from '../../../shared/components/ui/Input'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { contentService } from '../../../core/services'
import { StageContentFileType } from '../../../core/types/enums'

const FILE_TYPE_OPTIONS = [
  { value: StageContentFileType.VIDEO, label: 'Video' },
  { value: StageContentFileType.IMAGE, label: 'Gambar' },
  { value: StageContentFileType.AUDIO, label: 'Audio' },
  { value: StageContentFileType.GAME_BUNDLE, label: 'Game' },
]

const SOURCE_OPTIONS = [
  { value: 'file', label: 'Unggah File' },
  { value: 'url', label: 'URL / YouTube' },
]

const ContentFormPage = () => {
  const navigate = useNavigate()
  const { contentId } = useParams()
  const isEdit = Boolean(contentId)
  const { addToast } = useGlobalToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [fileType, setFileType] = useState<StageContentFileType>(StageContentFileType.VIDEO)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [sourceMode, setSourceMode] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState('')

  useEffect(() => {
    if (!isEdit || !contentId) return
    let cancelled = false
    setLoading(true)
    contentService
      .getById(contentId)
      .then((c) => {
        if (cancelled) return
        if (!c) {
          addToast({ type: 'error', message: 'Konten tidak ditemukan' })
          navigate(ROUTES.ADMIN.CONTENT)
          return
        }
        setTitle(c.title)
        setFileType(c.file_type as StageContentFileType)
        setYoutubeUrl(c.youtube_url ?? '')
        setDurationSeconds(c.duration_seconds != null ? String(c.duration_seconds) : '')
        setFileUrl(c.file_url ?? '')
        setSourceMode(c.file_url ? 'url' : 'file')
      })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', message: 'Gagal memuat konten' })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, contentId, addToast, navigate])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      addToast({ type: 'error', message: 'Judul wajib diisi' })
      return
    }
    const duration = durationSeconds ? Number(durationSeconds) : undefined
    const youtube = youtubeUrl.trim() || undefined

    try {
      setSaving(true)
      if (isEdit && contentId) {
        await contentService.update(contentId, {
          title: title.trim(),
          file_url: fileUrl.trim(),
          youtube_url: youtube,
          file_type: fileType,
          duration_seconds: duration,
        })
        addToast({ type: 'success', message: 'Konten berhasil diperbarui' })
      } else if (sourceMode === 'file') {
        if (!file) {
          addToast({ type: 'error', message: 'Pilih file terlebih dahulu' })
          return
        }
        await contentService.upload({
          file,
          title: title.trim(),
          file_type: fileType,
          duration_seconds: duration,
          youtube_url: youtube,
        })
        addToast({ type: 'success', message: 'Konten baru berhasil ditambahkan' })
      } else {
        await contentService.create({
          title: title.trim(),
          file_url: fileUrl.trim(),
          youtube_url: youtube,
          file_type: fileType,
          duration_seconds: duration,
        })
        addToast({ type: 'success', message: 'Konten baru berhasil ditambahkan' })
      }
      navigate(ROUTES.ADMIN.CONTENT)
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan konten' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Konten' : 'Tambah Konten Baru'}
        subtitle={isEdit ? 'Perbarui detail konten' : 'Buat konten baru untuk perpustakaan tenant'}
        breadcrumbs={[
          { label: 'Content Manager', href: ROUTES.ADMIN.CONTENT },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
        actions={
          <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.CONTENT)}>
            Kembali
          </Button>
        }
      />

      <Card className="space-y-4">
        <Input
          label="Judul"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Masukkan judul konten"
        />

        <Select
          label="Tipe File"
          required
          options={FILE_TYPE_OPTIONS}
          value={fileType}
          onChange={(e) => setFileType(e.target.value as StageContentFileType)}
        />

        <Input
          label="Durasi (detik)"
          type="number"
          min={0}
          value={durationSeconds}
          onChange={(e) => setDurationSeconds(e.target.value)}
          placeholder="Opsional, mis. 120"
        />

        {!isEdit && (
          <Select
            label="Sumber Konten"
            required
            options={SOURCE_OPTIONS}
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as 'file' | 'url')}
          />
        )}

        {sourceMode === 'file' ? (
          <div className="w-full">
            <label className="block text-sm font-medium text-on-surface mb-1">File</label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
            />
            {file && (
              <p className="mt-1 text-xs text-on-surface-variant flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> {file.name}
              </p>
            )}
          </div>
        ) : (
          <>
            <Input
              label="URL File"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://..."
              leftIcon={<Link2 className="w-4 h-4" />}
            />
            <Input
              label="YouTube URL"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              leftIcon={<Video className="w-4 h-4" />}
              hint="Isi jika konten video berasal dari YouTube."
            />
          </>
        )}
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(ROUTES.ADMIN.CONTENT)} disabled={saving}>
          Batal
        </Button>
        <Button onClick={handleSubmit} loading={saving}>
          {isEdit ? 'Simpan Perubahan' : 'Simpan Konten'}
        </Button>
      </div>
    </div>
  )
}

export default ContentFormPage
