import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { Badge } from '../../../shared/components/ui/Badge'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
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
import { Plus, FileText } from 'lucide-react'

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

  const [activeTab, setActiveTab] = useState<'detail' | 'konten' | 'kegiatan'>('detail')
  const [contents, setContents] = useState<StageContent[]>([])
  const [deleteTargetContent, setDeleteTargetContent] = useState<StageContent | null>(null)
  const [contentDeleting, setContentDeleting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

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

  const loadContents = async () => {
    if (!stageId || isNew || !programId) return
    const list = await programService.getContents(stageId)
    setContents(list)
    await syncStageMeta(programService, programId, stageId)
  }

  const loadKegiatan = async () => {
    if (!stageId || isNew) return
    setKegiatanLoading(true)
    try {
      setKegiatan(await programSubstageService.listByStage(stageId))
    } catch {
      setKegiatan([])
    } finally {
      setKegiatanLoading(false)
    }
  }

  useEffect(() => {
    loadContents()
  }, [stageId])

  useEffect(() => {
    loadKegiatan()
  }, [stageId, isNew])

  const handleSave = async (data: {
    name: string
    description: string
    is_recording_stage: boolean
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
          is_recording_stage: data.is_recording_stage,
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
        const existingContents = await programService.getContents(stageId)
        await programService.updateStage(programId, stageId, {
          name: data.name,
          description: data.description,
          is_recording_stage: data.is_recording_stage,
          is_photo_stage: data.is_photo_stage,
          duration_minutes: computeDurationMinutes(existingContents),
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

  const handleContentDelete = async () => {
    if (!stageId || !deleteTargetContent || !programId) return
    setContentDeleting(true)
    try {
      // Detach the junction only — the standalone Content itself is untouched.
      await programService.unassignContent(stageId, deleteTargetContent.id)
      setDeleteTargetContent(null)
      const updatedContents = await programService.getContents(stageId)
      setContents(updatedContents)
      await syncStageMeta(programService, programId, stageId)
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setContentDeleting(false)
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
            { key: 'konten', label: 'Konten' },
            { key: 'kegiatan', label: `Kegiatan (${kegiatan.length})` },
          ]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'detail' | 'konten' | 'kegiatan')}
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

      {!isNew && activeTab === 'konten' && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h4 className="text-lg font-semibold text-on-surface">Daftar Konten</h4>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setPickerOpen(true)}
              >
                Tambah dari Perpustakaan
              </Button>
              <Button
                icon={<Plus className="w-4 h-4" />}
                onClick={() => navigate(contentNewPath({ programId, stageId }))}
              >
                Upload Konten Baru
              </Button>
            </div>
          </div>

          {contents.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="Belum ada konten"
                description="Tambahkan konten dari perpustakaan atau unggah konten baru ke stage ini."
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {contents.map((content) => (
                <div key={content.id} className="flex items-center justify-between p-3 bg-surface-variant rounded-lg">
                  <div className="flex items-center gap-3">
                    {STAGE_CONTENT_FILE_TYPE_ICONS[content.file_type]}
                    <div>
                      <p className="text-sm font-medium text-on-surface">{content.title}</p>
                      <p className="text-xs text-on-surface-variant">
                        {content.youtube_url
                          ? YOUTUBE_LABEL
                          : `${STAGE_CONTENT_FILE_TYPE_LABELS[content.file_type]} · ${content.duration_seconds ?? 0}s`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!content.is_active && <Badge variant="neutral">Nonaktif</Badge>}
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => navigate(contentEditPath(content.id))}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setDeleteTargetContent(content)}
                      className="text-error"
                    >
                      Hapus
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ContentPickerModal
            open={pickerOpen}
            stageId={stageId!}
            onClose={() => setPickerOpen(false)}
            onPicked={async (picked) => {
              if (!stageId) return
              try {
                await programService.assignContent(stageId, picked.id)
                await loadContents()
                addToast({ type: 'success', message: 'Konten ditambahkan ke stage' })
              } catch (err) {
                addToast({ type: 'error', message: friendlyError(err) })
              } finally {
                setPickerOpen(false)
              }
            }}
          />
        </>
      )}

      {!isNew && activeTab === 'kegiatan' && stageId && (
        <KegiatanEditor
          programStageId={stageId}
          items={kegiatan}
          loading={kegiatanLoading}
          onChange={setKegiatan}
          onReload={loadKegiatan}
          onRequestDelete={(k) => setDeleteTargetKegiatan(k)}
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
        open={!!deleteTargetContent}
        title="Hapus Konten"
        message={`Yakin ingin menghapus konten "${deleteTargetContent?.title || ''}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        loading={contentDeleting}
        onConfirm={handleContentDelete}
        onClose={() => setDeleteTargetContent(null)}
      />

      <ConfirmDialog
        open={!!deleteTargetKegiatan}
        title="Hapus Kegiatan"
        message={`Yakin ingin menghapus kegiatan "${deleteTargetKegiatan?.name || ''}"? Tindakan ini tidak dapat dibatalkan.`}
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
