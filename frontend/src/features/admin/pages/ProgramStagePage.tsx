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
import type { Program, ProgramStage, StageContent } from '../../../core/types'
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

  const [activeTab, setActiveTab] = useState<'detail' | 'konten'>('detail')
  const [contents, setContents] = useState<StageContent[]>([])
  const [deleteTargetContent, setDeleteTargetContent] = useState<StageContent | null>(null)
  const [contentDeleting, setContentDeleting] = useState(false)

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

  useEffect(() => {
    loadContents()
  }, [stageId])

  const handleSave = async (data: {
    name: string
    description: string
    is_recording_stage: boolean
    is_photo_stage: boolean
  }) => {
    if (!programId) return
    setSaving(true)
    try {
      if (isNew) {
        const stages = await programService.getStages(programId)
        await programService.createStage(programId, {
          sequence_order: stages.length + 1,
          ...data,
          content_type: ContentTypeEnum.MIXED,
          duration_minutes: 0,
        })
      } else if (stageId) {
        const existingContents = await programService.getContents(stageId)
        await programService.updateStage(programId, stageId, {
          ...data,
          duration_minutes: computeDurationMinutes(existingContents),
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
      await programService.deleteContent(stageId, deleteTargetContent.id)
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
  if (!isNew && !stage) return <div className="text-center text-on-surface-variant">Stage not found</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'Buat Stage Baru' : `Edit Stage: ${stage?.name ?? ''}`}
        breadcrumbs={[
          { label: 'Programs', href: programListPath() },
          { label: program.name, href: programDetailPath(program.id) },
          { label: stage?.name || 'Buat Stage Baru', href: isNew ? undefined : programStagePath(program.id, stageId!) },
        ]}
        actions={
          !isNew && stage ? (
            <Button variant="danger" onClick={() => setDeleteTarget(stage)}>
              Hapus Stage
            </Button>
          ) : undefined
        }
      />

      {!isNew && (
        <Tabs
          tabs={[{ key: 'detail', label: 'Detail' }, { key: 'konten', label: 'Konten' }]}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'detail' | 'konten')}
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
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-semibold text-on-surface">Daftar Konten</h4>
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate(contentNewPath({ programId, stageId }))}
            >
              Tambah Konten
            </Button>
          </div>

          {contents.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileText className="w-12 h-12" />}
                title="Belum ada konten"
                description="Klik 'Tambah Konten' untuk menambahkan konten ke stage ini."
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
                      onClick={() => navigate(contentEditPath(content.id, { programId, stageId }))}
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
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Stage"
        message={`Yakin ingin menghapus stage "${deleteTarget?.name || ''}"? Seluruh konten di dalam stage ini juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Stage"
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
    </div>
  )
}

export default ProgramStagePage
