import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES, contentEditPath } from '../../../core/constants/app'
import { Plus, Pencil, Trash2, Play, Image, Music, Gamepad2, Loader2, Search } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { contentService } from '../../../core/services'
import { cn } from '../../../core/utils'
import type { Content, ContentUsage } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'
import { YOUTUBE_LABEL } from '../../../core/constants/labels'
import { getContentThumbnailSrc } from '../../../core/utils/content'
import { getActiveTenantId } from '../../../core/utils/tenant'

// ── File type helpers ──

const FILE_TYPE_META: Record<StageContentFileType, { icon: ReactNode; label: string; bg: string; fg: string; ring: string }> = {
  VIDEO: { icon: <Play className="w-4 h-4" />, label: 'Video', bg: 'bg-blue-100', fg: 'text-blue-700', ring: 'ring-blue-200/50' },
  IMAGE: { icon: <Image className="w-4 h-4" />, label: 'Gambar', bg: 'bg-emerald-100', fg: 'text-emerald-700', ring: 'ring-emerald-200/50' },
  AUDIO: { icon: <Music className="w-4 h-4" />, label: 'Audio', bg: 'bg-amber-100', fg: 'text-amber-700', ring: 'ring-amber-200/50' },
  GAME_BUNDLE: { icon: <Gamepad2 className="w-4 h-4" />, label: 'Game', bg: 'bg-purple-100', fg: 'text-purple-700', ring: 'ring-purple-200/50' },
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return 'Langsung'
  if (seconds < 60) return `${seconds} detik`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m} menit ${s} detik` : `${m} menit`
}

const FILE_TYPE_FILTER_OPTIONS = [
  { value: '', label: 'Semua Tipe' },
  { value: StageContentFileType.VIDEO, label: 'Video' },
  { value: StageContentFileType.IMAGE, label: 'Gambar' },
  { value: StageContentFileType.AUDIO, label: 'Audio' },
  { value: StageContentFileType.GAME_BUNDLE, label: 'Game' },
]

// ── Component ──

const ContentPage = () => {
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  const [loading, setLoading] = useState(true)
  const [contents, setContents] = useState<Content[]>([])
  const [search, setSearch] = useState('')
  const [fileTypeFilter, setFileTypeFilter] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Content | null>(null)
  const [usage, setUsage] = useState<ContentUsage[]>([])
  const [deleting, setDeleting] = useState(false)

  // Load all tenant content. Re-fetch whenever the search term changes
  // (debounced) so the backend drives text search.
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      setLoading(true)
      contentService
        .getAll({ limit: 100, search: search || undefined })
        .then((res) => {
          if (!cancelled) setContents(res.data)
        })
        .catch(() => {
          if (!cancelled) addToast({ type: 'error', message: 'Gagal memuat konten' })
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, addToast])

  const filtered = useMemo(
    () =>
      fileTypeFilter
        ? contents.filter((c) => c.file_type === fileTypeFilter)
        : contents,
    [contents, fileTypeFilter],
  )

  const openDelete = async (item: Content) => {
    setDeleteTarget(item)
    setUsage([])
    try {
      const u = await contentService.getUsage(item.id)
      setUsage(u)
    } catch {
      setUsage([])
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await contentService.remove(deleteTarget.id)
      setContents((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      addToast({ type: 'success', message: 'Konten dihapus' })
      setDeleteTarget(null)
      setUsage([])
    } catch {
      addToast({ type: 'error', message: 'Gagal menghapus konten' })
    } finally {
      setDeleting(false)
    }
  }

  const tenantId = getActiveTenantId() ?? undefined

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Manager"
        subtitle="Perpustakaan konten tenant: video, gambar, audio, game."
        actions={
          <Link to={ROUTES.ADMIN.CONTENT_NEW}>
            <Button icon={<Plus className="w-4 h-4" />}>
              Tambah Konten
            </Button>
          </Link>
        }
      />

      <div className="bg-surface-container-low p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center">
        <div className="w-full sm:w-72 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari konten..."
            className="w-full rounded-xl border border-outline-variant bg-surface pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            label="Tipe"
            options={FILE_TYPE_FILTER_OPTIONS}
            value={fileTypeFilter}
            onChange={(e) => setFileTypeFilter(e.target.value)}
          />
        </div>
        <div className="text-sm text-on-surface-variant ml-auto">
          {loading ? 'Memuat...' : `${filtered.length} konten ditemukan`}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Image className="w-12 h-12" />}
          title="Belum ada konten"
          description={
            contents.length === 0
              ? 'Buat konten baru untuk mengisinya.'
              : 'Tidak ada konten yang cocok dengan filter.'
          }
          action={{ label: 'Tambah Konten', onClick: () => navigate(ROUTES.ADMIN.CONTENT_NEW) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item) => {
            const meta = FILE_TYPE_META[item.file_type] || FILE_TYPE_META.VIDEO
            const isYouTube = item.file_type === StageContentFileType.VIDEO && !!item.youtube_url
            const thumbnail = getContentThumbnailSrc(item as never, tenantId)
            return (
              <Card key={item.id} padding="none" className="hover:shadow-md transition-shadow flex flex-col overflow-hidden">
                <div className="relative aspect-video bg-surface-container-high flex items-center justify-center overflow-hidden">
                  {thumbnail.type === 'image' && thumbnail.src ? (
                    <img
                      src={thumbnail.src}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : thumbnail.type === 'video' && thumbnail.src ? (
                    <video
                      src={thumbnail.src}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                    />
                  ) : (
                    <div className={cn('flex items-center justify-center w-12 h-12 rounded-full', meta.bg)}>
                      <span className={meta.fg}>{meta.icon}</span>
                    </div>
                  )}
                  <div className={cn('absolute top-2 left-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ring-1', meta.bg, meta.fg, meta.ring)}>
                    {meta.icon}
                    {isYouTube ? YOUTUBE_LABEL : meta.label}
                  </div>
                </div>

                <div className="p-4 flex flex-col flex-1 min-w-0">
                  <p className="font-medium text-on-surface truncate" title={item.title}>{item.title}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {isYouTube ? YOUTUBE_LABEL : formatDuration(item.duration_seconds)}
                  </p>

                  <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-outline-variant/20">
                    <Link to={contentEditPath(item.id)}>
                      <Button
                        variant="ghost" size="sm"
                        icon={<Pencil className="w-3.5 h-3.5" />}
                        tooltip="Edit"
                      />
                    </Link>
                    <Button
                      variant="ghost" size="sm"
                      icon={<Trash2 className="w-3.5 h-3.5 text-error" />}
                      tooltip="Hapus"
                      onClick={() => openDelete(item)}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Konten"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Batal</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete}>Hapus</Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin menghapus konten &ldquo;{deleteTarget?.title}&rdquo;? Tindakan ini tidak dapat dibatalkan.
        </p>
        {usage.length > 0 && (
          <div className="mt-4 rounded-xl bg-surface-container-low p-3">
            <p className="text-xs font-medium text-on-surface-variant mb-2">
              Konten ini masih digunakan di {usage.length} stage:
            </p>
            <ul className="space-y-1 text-xs text-on-surface">
              {usage.map((u) => (
                <li key={`${u.program_id}-${u.stage_id}`} className="flex items-center gap-1">
                  <Badge variant="neutral">{u.program_name}</Badge>
                  <span className="text-on-surface-variant">&rarr;</span>
                  <span>{u.stage_name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-on-surface-variant">
              Menghapus konten akan melepasnya dari semua stage tersebut.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ContentPage
