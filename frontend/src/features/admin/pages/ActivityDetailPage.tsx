import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2, Plus, Play, Image, Gamepad2, Loader2 } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { ListEmptyState } from '../../../shared/components/feedback/ListEmptyState'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programStageService } from '../../../core/services/program-stages'
import { programSubstageService } from '../../../core/services/program-substages'
import {
  activityListPath,
  activityEditPath,
  contentNewPath,
  contentEditPath,
} from '../../../core/constants/app'
import { STAGE_CONTENT_FILE_TYPE_LABELS, YOUTUBE_LABEL } from '../../../core/constants/labels'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage, ProgramSubstage, StageContent } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'

const FILE_TYPE_META: Record<StageContentFileType, { icon: React.ReactNode; label: string; fg: string }> = {
  [StageContentFileType.VIDEO]: { icon: <Play className="w-4 h-4" />, label: 'Video', fg: 'text-blue-700' },
  [StageContentFileType.IMAGE]: { icon: <Image className="w-4 h-4" />, label: 'Gambar', fg: 'text-emerald-700' },
  [StageContentFileType.GAME_BUNDLE]: { icon: <Gamepad2 className="w-4 h-4" />, label: 'Game', fg: 'text-purple-700' },
}

const ActivityDetailPage = () => {
  const { activityId } = useParams<{ activityId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  const [activity, setActivity] = useState<ProgramSubstage | null>(null)
  const [stage, setStage] = useState<ProgramStage | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [contents, setContents] = useState<StageContent[]>([])
  const [loading, setLoading] = useState(true)
  const [contentsLoading, setContentsLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!activityId) return
    setLoading(true)
      ; (async () => {
        try {
          const found = await programSubstageService.getById(activityId)
          if (!found) {
            addToast({ type: 'error', message: 'Kegiatan tidak ditemukan' })
            navigate(activityListPath())
            return
          }
          setActivity(found)

          const stageList = await programStageService.getAll({ limit: 1000 })
          const parent = stageList.data.find((s) => s.id === found.program_stage_id)
          if (parent) {
            setStage(parent)
            const programs = await programService.getAll({ limit: 1000 })
            const prog = programs.data.find((p) => p.id === parent.program_id)
            if (prog) setProgram(prog)
          }

          setContentsLoading(true)
          const contentList = await programService.getContents(found.id)
          setContents(contentList)
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
          setContentsLoading(false)
        }
      })()
  }, [activityId, addToast, navigate])

  const contentEditHref = useMemo(
    () => (contentId: string) => {
      if (!program || !stage) return contentEditPath(contentId)
      return contentEditPath(contentId, { programId: program.id, stageId: stage.id })
    },
    [program, stage],
  )

  const newContentHref = useMemo(
    () => {
      if (!program || !stage) return contentNewPath()
      return contentNewPath({ programId: program.id, stageId: stage.id })
    },
    [program, stage],
  )

  const handleDelete = async () => {
    if (!activity) return
    setDeleting(true)
    try {
      await programSubstageService.remove(activity.id)
      addToast({ type: 'success', message: 'Kegiatan dihapus' })
      setDeleteOpen(false)
      navigate(activityListPath())
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!activity) {
    return (
      <div className="text-center text-on-surface-variant py-12">
        Kegiatan tidak ditemukan
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate(activityListPath())}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={activity.name}
        subtitle={`Program: ${program?.name || '-'} · Topik: ${stage?.name || '-'}`}
        breadcrumbs={[
          { label: 'Kegiatan', href: activityListPath() },
          { label: activity.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Pencil className="w-4 h-4" />}
              onClick={() => navigate(activityEditPath(activity.id))}
            >
              Edit
            </Button>
            <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setDeleteOpen(true)}>
              Hapus
            </Button>
          </div>
        }
      />

      <Card title="Informasi Kegiatan">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Program</p>
            <p className="text-sm text-on-surface">{program?.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Topik</p>
            <p className="text-sm text-on-surface">{stage?.name || '-'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Nama Kegiatan</p>
            <p className="text-sm text-on-surface">{activity.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Deskripsi</p>
            <p className="text-sm text-on-surface">{activity.description || '-'}</p>
          </div>
        </div>
      </Card>

      <Card
        title="Konten yang Ditugaskan"
        actions={
          <Link to={newContentHref}>
            <Button icon={<Plus className="w-4 h-4" />}>Tambah Konten</Button>
          </Link>
        }
      >
        {contentsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : contents.length === 0 ? (
          <ListEmptyState
            icon={<Play className="w-10 h-10" />}
            title="Belum ada konten"
            description="Klik 'Tambah Konten' di atas untuk menambahkan konten ke kegiatan ini."
          />
        ) : (
          <ul className="space-y-2">
            {contents.map((content) => {
              const meta = FILE_TYPE_META[content.file_type] ?? FILE_TYPE_META.VIDEO
              const isYouTube = content.file_type === 'VIDEO' && !!content.youtube_url
              return (
                <li
                  key={content.id}
                  className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={meta.fg}>{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{content.title}</p>
                      <p className="text-xs text-on-surface-variant">
                        <Badge variant="neutral" size="sm" className="mr-1">
                          {isYouTube ? YOUTUBE_LABEL : STAGE_CONTENT_FILE_TYPE_LABELS[content.file_type]}
                        </Badge>
                        {!isYouTube && `${content.duration_seconds ?? 0} detik`}
                      </p>
                    </div>
                  </div>
                  <Link to={contentEditHref(content.id)}>
                    <Button variant="ghost" size="sm">
                      Edit
                    </Button>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        title="Hapus Kegiatan"
        message={`Yakin ingin menghapus kegiatan "${activity.name}"? Konten yang ditugaskan akan dilepas. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  )
}

export default ActivityDetailPage
