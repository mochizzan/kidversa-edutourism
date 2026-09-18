import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { ConfirmDialog } from '../../../shared/components/feedback/ConfirmDialog'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { BadgeEditor } from '../components/BadgeEditor'
import {
  topicListPath,
  topicDetailPath,
  programDetailPath,
} from '../../../core/constants/app'
import { ContentType } from '../../../core/types/enums'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage } from '../../../core/types'

const TopicFormPage = () => {
  const { topicId } = useParams<{ topicId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { addToast } = useGlobalToast()
  const isNew = !topicId || topicId === 'new'

  const programIdFromQuery = searchParams.get('programId') || ''
  const cameFromProgram = Boolean((location.state as { programId?: string } | null)?.programId)

  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(true)
  const [stage, setStage] = useState<ProgramStage | null>(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProgramStage | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [programId, setProgramId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPhotoStage, setIsPhotoStage] = useState(true)
  const [badgeName, setBadgeName] = useState('')
  const [badgeImageUrl, setBadgeImageUrl] = useState('')

  useEffect(() => {
    setProgramsLoading(true)
    programService
      .getAll({ limit: 1000 })
      .then((res) => setPrograms(res.data))
      .catch(() => setPrograms([]))
      .finally(() => setProgramsLoading(false))
  }, [])

  useEffect(() => {
    if (programIdFromQuery && !programId) {
      setProgramId(programIdFromQuery)
    }
  }, [programIdFromQuery, programId])

  useEffect(() => {
    if (isNew || !topicId) {
      setLoading(false)
      return
    }
    setLoading(true)
      ; (async () => {
        try {
          for (const program of programs.length ? programs : (await programService.getAll({ limit: 1000 })).data) {
            const stages = await programService.getStages(program.id)
            const found = stages.find((s) => s.id === topicId)
            if (found) {
              setStage(found)
              setProgramId(program.id)
              setName(found.name)
              setDescription(found.description || '')
              setIsPhotoStage(found.is_photo_stage)
              setBadgeName(found.badge_name || '')
              setBadgeImageUrl(found.badge_image_url || '')
              break
            }
          }
        } catch {
          setStage(null)
        } finally {
          setLoading(false)
        }
      })()
  }, [isNew, topicId, programs])

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === programId) || null,
    [programs, programId],
  )

  const programOptions = useMemo(
    () =>
      programs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.name })),
    [programs],
  )

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!programId) {
      addToast({ type: 'error', message: 'Program wajib dipilih' })
      return
    }
    if (!name.trim()) {
      addToast({ type: 'error', message: 'Nama topik wajib diisi' })
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const stages = await programService.getStages(programId)
        const created = await programService.createStage(programId, {
          sequence_order: stages.length + 1,
          name: name.trim(),
          description: description.trim() || undefined,
          content_type: ContentType.MIXED,
          is_photo_stage: isPhotoStage,
        })
        if (badgeName.trim() || badgeImageUrl.trim()) {
          await programService.updateStage(programId, created.id, {
            badge_name: badgeName.trim() || undefined,
            badge_image_url: badgeImageUrl.trim() || undefined,
          })
        }
        addToast({ type: 'success', message: 'Topik berhasil dibuat' })
        navigate(topicDetailPath(created.id), { state: { showAddActivityCta: true } })
      } else if (topicId) {
        await programService.updateStage(programId, topicId, {
          name: name.trim(),
          description: description.trim() || undefined,
          is_photo_stage: isPhotoStage,
          content_type: ContentType.MIXED,
          badge_name: badgeName.trim() || undefined,
          badge_image_url: badgeImageUrl.trim() || undefined,
        })
        addToast({ type: 'success', message: 'Topik berhasil diperbarui' })
        navigate(topicDetailPath(topicId))
      }
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !programId) return
    setDeleting(true)
    try {
      await programService.deleteStage(programId, deleteTarget.id)
      addToast({ type: 'success', message: 'Topik dihapus' })
      navigate(topicListPath())
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (loading || programsLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  if (!isNew && !stage) {
    return (
      <div className="text-center text-on-surface-variant py-12">
        Topik tidak ditemukan
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate(topicListPath())}>
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isNew ? 'Buat Topik Baru' : `Edit Topik: ${stage?.name ?? ''}`}
        subtitle={selectedProgram ? `Program: ${selectedProgram.name}` : 'Pilih program terlebih dahulu'}
        breadcrumbs={[
          { label: 'Topik', href: topicListPath() },
          { label: isNew ? 'Buat Baru' : stage?.name || 'Edit' },
        ]}
        actions={
          !isNew && stage ? (
            <Button variant="danger" onClick={() => setDeleteTarget(stage)}>
              Hapus Topik
            </Button>
          ) : undefined
        }
      />

      <Card>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Select
            label="Program"
            placeholder="Pilih Program"
            value={programId}
            options={programOptions}
            onChange={(e) => setProgramId(e.target.value)}
            required
            disabled={!isNew || cameFromProgram}
          />

          <Input
            label="Nama Topik"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama topik"
            required
          />

          <Input
            label="Deskripsi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi singkat topik"
          />

          <div className="flex items-center gap-3">
            <input
              id="isPhotoStage"
              type="checkbox"
              checked={isPhotoStage}
              onChange={(e) => setIsPhotoStage(e.target.checked)}
              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
            />
            <label htmlFor="isPhotoStage" className="text-sm text-on-surface">
              Foto Stage badge
            </label>
          </div>

          <BadgeEditor
            title="Badge Topik"
            variant="subtopik"
            name={badgeName}
            imageUrl={badgeImageUrl}
            helperText="Diberikan otomatis ke anak saat semua kegiatan dalam topik ini sudah dinilai."
            onNameChange={setBadgeName}
            onImageChange={setBadgeImageUrl}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                selectedProgram && !isNew
                  ? navigate(programDetailPath(selectedProgram.id))
                  : navigate(topicListPath())
              }
            >
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan
            </Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus Topik"
        message={`Yakin ingin menghapus topik "${deleteTarget?.name || ''}"? Seluruh kegiatan di dalamnya juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Topik"
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default TopicFormPage
