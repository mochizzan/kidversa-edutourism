import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ROUTES, programStagePath } from '../../../core/constants/app'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Select } from '../../../shared/components/ui/Select'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage, StageContent } from '../../../core/types'
import { syncStageMeta } from '../../../core/utils/content'
import { StageContentForm, type StageContentFormValues } from '../components/StageContentForm'

const ContentFormPage = () => {
  const navigate = useNavigate()
  const { contentId } = useParams()
  const [searchParams] = useSearchParams()
  const queryProgramId = searchParams.get('programId')
  const queryStageId = searchParams.get('stageId')
  const isContextual = Boolean(queryProgramId && queryStageId)
  const isEdit = Boolean(contentId)
  const { addToast } = useGlobalToast()

  const [loading, setLoading] = useState(isEdit)
  const [programs, setPrograms] = useState<Program[]>([])
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [selectedProgram, setSelectedProgram] = useState(queryProgramId || '')
  const [stageId, setStageId] = useState(queryStageId || '')
  const [initialContent, setInitialContent] = useState<StageContent | null>(null)

  const goBack = useCallback(() => {
    if (isContextual && queryProgramId && queryStageId) {
      navigate(programStagePath(queryProgramId, queryStageId))
    } else {
      navigate(ROUTES.ADMIN.CONTENT)
    }
  }, [isContextual, queryProgramId, queryStageId, navigate])

  useEffect(() => {
    let cancelled = false
    programService.getAll({ limit: 100 }).then(async (res) => {
      if (cancelled) return
      setPrograms(res.data)

      if (isEdit && contentId) {
        let foundContent: StageContent | null = null
        let foundStage: ProgramStage | null = null
        let foundProgram: Program | null = null

        for (const p of res.data) {
          const stgs = await programService.getStages(p.id)
          if (cancelled) return
          for (const s of stgs) {
            const contents = await programService.getContents(s.id)
            if (cancelled) return
            const c = contents.find((x) => x.id === contentId)
            if (c) {
              foundContent = c
              foundStage = s
              foundProgram = p
              break
            }
          }
          if (foundContent) break
        }

        if (foundContent && foundProgram && foundStage && !cancelled) {
          setSelectedProgram(foundProgram.id)
          const pStages = await programService.getStages(foundProgram.id)
          if (!cancelled) {
            setStages(pStages)
            setStageId(foundStage.id)
            setInitialContent(foundContent)
          }
        }
      }
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [isEdit, contentId])

  const loadStages = useCallback(async (programId: string) => {
    if (!programId) { setStages([]); return }
    const res = await programService.getStages(programId)
    setStages(res)
    setStageId('')
  }, [])

  const handleProgramChange = (programId: string) => {
    setSelectedProgram(programId)
    loadStages(programId)
  }

  const handleContentSubmit = async (data: StageContentFormValues) => {
    if (!stageId) {
      addToast({ type: 'error', message: 'Pilih stage terlebih dahulu' })
      return
    }
    try {
      if (isEdit && contentId) {
        await programService.updateContent(stageId, contentId, data)
        addToast({ type: 'success', message: 'Konten berhasil diperbarui' })
      } else {
        const existing = await programService.getContents(stageId)
        await programService.createContent(stageId, { ...data, sort_order: existing.length })
        addToast({ type: 'success', message: 'Konten baru berhasil ditambahkan' })
      }

      const effectiveProgramId = selectedProgram || queryProgramId
      if (effectiveProgramId) {
        await syncStageMeta(programService, effectiveProgramId, stageId)
      }

      goBack()
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan konten' })
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
        subtitle={isEdit ? 'Perbarui detail konten stage' : 'Buat konten baru untuk stage'}
        breadcrumbs={[
          { label: 'Content Manager', href: ROUTES.ADMIN.CONTENT },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
        actions={
          <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />} onClick={goBack}>
            Kembali
          </Button>
        }
      />

      <Card>
        <Select
          label="Program"
          required
          options={programs.map((p) => ({ value: p.id, label: p.name }))}
          value={selectedProgram}
          onChange={(e) => handleProgramChange(e.target.value)}
          placeholder="Pilih Program"
          disabled={isContextual}
        />
        <Select
          label="Stage"
          required
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          placeholder="Pilih Stage"
          disabled={isContextual || !selectedProgram}
          hint={!selectedProgram ? 'Pilih program terlebih dahulu' : undefined}
        />
      </Card>

      <StageContentForm
        initial={initialContent}
        onSubmit={handleContentSubmit}
        onCancel={goBack}
      />
    </div>
  )
}

export default ContentFormPage
