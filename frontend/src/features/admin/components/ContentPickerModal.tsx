import { useState, useEffect } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { contentService } from '../../../core/services'
import type { Content } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'
import { getContentThumbnailSrc } from '../../../core/utils/content'
import { getActiveTenantId } from '../../../core/utils/tenant'
import { STAGE_CONTENT_FILE_TYPE_LABELS, YOUTUBE_LABEL } from '../../../core/constants/labels'
import { Loader2 } from 'lucide-react'

interface ContentPickerModalProps {
  open: boolean
  stageId: string
  onClose: () => void
  onPicked: (content: Content) => void
}

const ContentPickerModal = ({ open, stageId: _stageId, onClose, onPicked }: ContentPickerModalProps) => {
  const [loading, setLoading] = useState(false)
  const [contents, setContents] = useState<Content[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    contentService
      .getAll({ limit: 100, search: search || undefined })
      .then((res) => {
        if (!cancelled) setContents(res.data)
      })
      .catch(() => {
        if (!cancelled) setContents([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, search])

  const tenantId = getActiveTenantId() ?? undefined

  return (
    <Modal open={open} onClose={onClose} title="Pilih Konten dari Perpustakaan" size="lg">
      <div className="space-y-3">
        <Input
          placeholder="Cari konten..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
        ) : contents.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-10">
            Tidak ada konten yang cocok.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {contents.map((item) => {
              const isYouTube =
                item.file_type === StageContentFileType.VIDEO && !!item.youtube_url
              const thumbnail = getContentThumbnailSrc(item as never, tenantId)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPicked(item)}
                  className="text-left rounded-xl border border-outline-variant bg-surface overflow-hidden hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="aspect-video bg-surface-container-high flex items-center justify-center overflow-hidden">
                    {thumbnail.type === 'image' && thumbnail.src ? (
                      <img src={thumbnail.src} alt={item.title} className="w-full h-full object-cover" />
                    ) : thumbnail.type === 'video' && thumbnail.src ? (
                      <video src={thumbnail.src} className="w-full h-full object-cover" preload="metadata" muted />
                    ) : (
                      <span className="text-xs text-on-surface-variant">No Preview</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-sm font-medium text-on-surface truncate" title={item.title}>
                      {item.title}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {isYouTube
                        ? YOUTUBE_LABEL
                        : STAGE_CONTENT_FILE_TYPE_LABELS[item.file_type]}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export { ContentPickerModal }
