import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programStageService } from '../../../core/services/program-stages'
import { programSubstageService } from '../../../core/services/program-substages'
import { activityListPath, activityNewPath, activityDetailPath } from '../../../core/constants/app'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage, ProgramSubstage } from '../../../core/types'

const ActivityFormPage = () => {
  const { activityId } = useParams<{ activityId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { addToast } = useGlobalToast()

  const isNew = !activityId || activityId === 'new'
  const queryProgramId = searchParams.get('programId') || ''
  const queryStageId = searchParams.get('stageId') || ''

  const [programs, setPrograms] = useState<Program[]>([])
  const [programsLoading, setProgramsLoading] = useState(true)
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [stagesLoading, setStagesLoading] = useState(false)
  const [activity, setActivity] = useState<ProgramSubstage | null>(null)
  const [loading, setLoading] = useState(!isNew)

  const [programId, setProgramId] = useState(queryProgramId)
  const [stageId, setStageId] = useState(queryStageId)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProgramsLoading(true)
    programService
      .getAll({ limit: 1000 })
      .then((res) => setPrograms(res.data))
      .catch(() => setPrograms([]))
      .finally(() => setProgramsLoading(false))
  }, [])

  useEffect(() => {
    if (!programId) {
      setStages([])
      return
    }
    setStagesLoading(true)
    programStageService
      .getAll({ programId, limit: 1000 })
      .then((res) => setStages(res.data))
      .catch(() => setStages([]))
      .finally(() => setStagesLoading(false))
  }, [programId])

  useEffect(() => {
    if (isNew || !activityId) {
      setLoading(false)
      return
    }
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
          setName(found.name)
          setDescription(found.description || '')
          setStageId(found.program_stage_id)

          const stageList = await programStageService.getAll({ limit: 1000 })
          const parent = stageList.data.find((s) => s.id === found.program_stage_id)
          if (parent) {
            setProgramId(parent.program_id)
          }
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
        }
      })()
  }, [isNew, activityId, addToast, navigate])

  const programOptions = useMemo(
    () =>
      programs
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: p.name })),
    [programs],
  )

  const stageOptions = useMemo(
    () =>
      stages
        .slice()
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((s) => ({ value: s.id, label: s.name })),
    [stages],
  )

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === programId) || null,
    [programs, programId],
  )

  const handleProgramChange = (value: string) => {
    setProgramId(value)
    setStageId('')
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!programId) {
      addToast({ type: 'error', message: 'Program wajib dipilih' })
      return
    }
    if (!stageId) {
      addToast({ type: 'error', message: 'Topik wajib dipilih' })
      return
    }
    if (!name.trim()) {
      addToast({ type: 'error', message: 'Nama kegiatan wajib diisi' })
      return
    }

    setSaving(true)
    try {
      if (isNew) {
        const existing = await programSubstageService.listByStage(stageId)
        const created = await programSubstageService.create({
          program_stage_id: stageId,
          sequence_order: existing.length + 1,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        addToast({ type: 'success', message: 'Kegiatan berhasil dibuat' })
        navigate(activityDetailPath(created.id))
      } else if (activityId) {
        const updated = await programSubstageService.update(activityId, {
          program_stage_id: stageId,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        addToast({ type: 'success', message: 'Kegiatan berhasil diperbarui' })
        navigate(activityDetailPath(updated.id))
      }
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (isNew) {
      navigate(activityNewPath({ programId: queryProgramId || undefined, stageId: queryStageId || undefined }))
      return
    }
    navigate(activityDetailPath(activityId!))
  }

  if (loading || programsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isNew && !activity) {
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
        title={isNew ? 'Tambah Kegiatan Baru' : `Edit Kegiatan: ${activity?.name ?? ''}`}
        subtitle={selectedProgram ? `Program: ${selectedProgram.name}` : 'Pilih program dan topik terlebih dahulu'}
        breadcrumbs={[
          { label: 'Kegiatan', href: activityListPath() },
          { label: isNew ? 'Buat Baru' : activity?.name || 'Edit' },
        ]}
      />

      <Card>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <Select
            label="Program"
            placeholder="Pilih Program"
            value={programId}
            options={programOptions}
            onChange={(e) => handleProgramChange(e.target.value)}
            required
            disabled={programsLoading}
          />

          <Select
            label="Topik"
            placeholder={programId ? 'Pilih Topik' : 'Pilih Program Dulu'}
            value={stageId}
            options={stageOptions}
            onChange={(e) => setStageId(e.target.value)}
            required
            disabled={!programId || stagesLoading}
          />

          <Input
            label="Nama Kegiatan"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama kegiatan"
            required
          />

          <Input
            label="Deskripsi"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Deskripsi singkat kegiatan"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={handleCancel}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              Simpan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

export default ActivityFormPage
