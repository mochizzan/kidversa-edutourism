import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Badge } from '../../../shared/components/ui/Badge'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/programSubstages'
import type { Program, ProgramStage, StageContent, ProgramSubstage } from '../../../core/types'
import { ContentType as ContentTypeEnum } from '../../../core/types'
import {
  programListPath,
  programDetailPath,
  programStagePath,
  contentNewPath,
  contentEditPath,
} from '../../../core/constants/app'
import { STAGE_CONTENT_FILE_TYPE_LABELS, STAGE_CONTENT_FILE_TYPE_ICONS, YOUTUBE_LABEL } from '../../../core/constants/labels'
import { computeDurationMinutes, syncStageMeta } from '../../../core/utils/content'
import { friendlyError } from '../../../core/utils/errorMessages'
import { StageForm } from '../components/StageForm'
import { ContentPickerModal } from '../components/ContentPickerModal'
import { KegiatanEditor } from '../components/KegiatanEditor'
import { Plus } from 'lucide-react'

interface KegiatanContentProps {
  programId: string
  stageId: string
  kegiatan: ProgramSubstage
}

// Konten adalah anak dari Kegiatan: ditampilkan di dalam kartu kegiatan,
// bukan sebagai tab terpisah. Urutan visual: Topik → Kegiatan → Konten.
function KegiatanContent({ programId, stageId, kegiatan }: KegiatanContentProps) {
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const [contents, setContents] = useState<StageContent[]>([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StageContent | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const list = await programService.getContents(kegiatan.id)
      setContents(list)
      await syncStageMeta(programService, programId, stageId, kegiatan.id)
    } catch {
      setContents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kegiatan.id])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await programService.unassignContent(kegiatan.id, deleteTarget.id)
      setDeleteTarget(null)
      await load()
      addToast({ type: 'success', message: 'Konten dihapus dari kegiatan' })
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="border-l-2 border-primary pl-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
        Konten
      </p>
      {loading ? (
        <p className="text-xs text-on-surface-variant">Memuat konten…</p>
      ) : contents.length === 0 ? (
        <div className="rounded-lg bg-surface p-3">
          <p className="text-sm text-on-surface-variant">
            Konten belum ditambahkan ke kegiatan ini.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary" size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setPickerOpen(true)}
            >
              Tambah dari Perpustakaan
            </Button>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate(contentNewPath({ programId, stageId }))}
            >
              Upload Konten Baru
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {contents.map((content) => (
              <div
                key={content.id}
                className="flex items-center justify-between p-3 bg-surface rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {STAGE_CONTENT_FILE_TYPE_ICONS[content.file_type]}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{content.title}</p>
                    <p className="text-xs text-on-surface-variant">
                      {content.youtube_url
                        ? YOUTUBE_LABEL
                        : `${STAGE_CONTENT_FILE_TYPE_LABELS[content.file_type]} · ${content.duration_seconds ?? 0}s`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!content.is_active && <Badge variant="neutral">Nonaktif</Badge>}
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => navigate(contentEditPath(content.id))}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setDeleteTarget(content)}
                    className="text-error"
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary" size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setPickerOpen(true)}
            >
              Tambah dari Perpustakaan
            </Button>
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate(contentNewPath({ programId, stageId }))}
            >
              Upload Konten Baru
            </Button>
          </div>
        </>
      )}

      <ContentPickerModal
        open={pickerOpen}
        stageId={stageId}
        onClose={() => setPickerOpen(false)}
        onPicked={async (picked) => {
          try {
            await programService.assignContent(kegiatan.id, picked.id)
            await load()
            addToast({ type: 'success', message: 'Konten ditambahkan ke kegiatan' })
          } catch (err) {
            addToast({ type: 'error', message: friendlyError(err) })
          } finally {
            setPickerOpen(false)
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Konten"
        message={`Yakin ingin menghapus konten "${deleteTarget?.title || ''}" dari kegiatan ini? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

const ProgramStagePage = () => {
  const { programId, stageId } = useParams<{ programId: string; stageId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isNew = !stageId || stageId === 'new'

  const [program, setProgram] = useState<Program | null>(null)
  const [stage, setStage] = useState<ProgramStage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProgramStage | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [activeTab, setActiveTab] = useState<'detail' | 'kegiatan'>('detail')

  const [kegiatan, setKegiatan] = useState<ProgramSubstage[]>([])
  const [kegiatanLoading, setKegiatanLoading] = useState(false)
  const [deleteTargetKegiatan, setDeleteTargetKegiatan] = useState<ProgramSubstage | null>(null)
  const [kegiatanDeleting, setKegiatanDeleting] = useState(false)

  useEffect(() => {
    if (!programId) return
    ;(async () => {
      setLoading(true)
      try {
        const prog = await programService.getById(programId)
        setProgram(prog)
        if (!isNew && stageId) {
          const stages = await programService.getStages(programId)
          setStage(stages.find((s) => s.id === stageId) ?? null)
        }
      } catch {
        setProgram(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [programId, stageId, isNew])

  const loadKegiatan = async () => {
    if (!stageId || isNew) return
    setKegiatanLoading(true)
    try {
      const list = await programSubstageService.listByStage(stageId)
      setKegiatan(list)
    } catch {
      setKegiatan([])
    } finally {
      setKegiatanLoading(false)
    }
  }

  useEffect(() => {
    loadKegiatan()
  }, [stageId, isNew])

  const handleSave = async (data: {
    name: string
    description: string
    is_photo_stage: boolean
    badge_name: string
    badge_image_url: string
  }) => {
    if (!programId) return
    setSaving(true)
    try {
      if (isNew) {
        const stages = await programService.getStages(programId)
        const created = await programService.createStage(programId, {
          sequence_order: stages.length + 1,
          name: data.name,
          description: data.description,
          is_photo_stage: data.is_photo_stage,
          content_type: ContentTypeEnum.MIXED,
          duration_minutes: 0,
        })
        // Badge fields are not accepted on create; persist them via update.
        if (data.badge_name || data.badge_image_url) {
          await programService.updateStage(programId, created.id, {
            badge_name: data.badge_name,
            badge_image_url: data.badge_image_url,
          })
        }
      } else if (stageId) {
        const allContents = (
          await Promise.all(kegiatan.map((k) => programService.getContents(k.id)))
        ).flat()
        await programService.updateStage(programId, stageId, {
          name: data.name,
          description: data.description,
          is_photo_stage: data.is_photo_stage,
          duration_minutes: computeDurationMinutes(allContents),
          badge_name: data.badge_name,
          badge_image_url: data.badge_image_url,
        })
      }
      navigate(programDetailPath(programId))
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!programId || !stageId) return
    setDeleting(true)
    try {
      await programService.deleteStage(programId, stageId)
      navigate(programDetailPath(programId))
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program) return <div className="text-center text-on-surface-variant">Program not found</div>
  if (!isNew && !stage) return <div className="text-center text-on-surface-variant">Topik tidak ditemukan</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'Buat Topik Baru' : `Edit Topik: ${stage?.name ?? ''}`}
        breadcrumbs={[
          { label: 'Programs', href: programListPath() },
          { label: program.name, href: programDetailPath(program.id) },
          { label: stage?.name || 'Buat Topik Baru', href: isNew ? undefined : programStagePath(program.id, stageId!) },
        ]}
        actions={
          !isNew && stage ? (
            <Button variant="danger" onClick={() => setDeleteTarget(stage)}>
              Hapus Topik
            </Button>
          ) : undefined
        }
      />

      {!isNew && (
        <Tabs
          tabs={[
            { key: 'detail', label: 'Detail' },
            { key: 'kegiatan', label: `Kegiatan (${kegiatan.length})` },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'detail' | 'kegiatan')}
        />
      )}

      {activeTab === 'detail' && (
        <Card>
          <StageForm
            editingStage={isNew ? null : stage}
            onSubmit={handleSave}
            onCancel={() => navigate(programDetailPath(program.id))}
            submitting={saving}
          />
        </Card>
      )}

      {!isNew && activeTab === 'kegiatan' && stageId && (
        <KegiatanEditor
          programStageId={stageId}
          items={kegiatan}
          loading={kegiatanLoading}
          onChange={setKegiatan}
          onReload={loadKegiatan}
          onRequestDelete={(k) => setDeleteTargetKegiatan(k)}
          contentSlot={(k) => (
            <KegiatanContent programId={programId!} stageId={stageId} kegiatan={k} />
          )}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Topik"
        message={`Yakin ingin menghapus topik "${deleteTarget?.name || ''}"? Seluruh konten di dalam topik ini juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Topik"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTargetKegiatan}
        title="Hapus Kegiatan"
        message={`Yakin ingin menghapus kegiatan "${deleteTargetKegiatan?.name || ''}"? Konten di dalam kegiatan ini juga akan dilepas. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Kegiatan"
        loading={kegiatanDeleting}
        onConfirm={async () => {
          if (!deleteTargetKegiatan) return
          setKegiatanDeleting(true)
          try {
            await programSubstageService.remove(deleteTargetKegiatan.id)
            setDeleteTargetKegiatan(null)
            await loadKegiatan()
            addToast({ type: 'success', message: 'Kegiatan dihapus' })
          } catch (err) {
            addToast({ type: 'error', message: friendlyError(err) })
          } finally {
            setKegiatanDeleting(false)
          }
        }}
        onClose={() => setDeleteTargetKegiatan(null)}
      />
    </div>
  )
}

export default ProgramStagePage
