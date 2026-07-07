import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Loader2, Upload } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage } from '../../../core/types'
import { StageContentFileType } from '../../../core/types/enums'

const ContentFormPage = () => {
  const navigate = useNavigate()
  const { contentId } = useParams()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(contentId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [programs, setPrograms] = useState<Program[]>([])
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [selectedProgram, setSelectedProgram] = useState('')
  const [stageId, setStageId] = useState('')

  const [form, setForm] = useState({
    title: '',
    file_type: StageContentFileType.VIDEO,
    file_url: 'placeholder_url',
    duration_seconds: 0,
    sort_order: 1,
    is_active: true,
  })

  // Load initial data
  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => {
      setPrograms(res.data)
      if (isEdit && contentId) {
        // Find which stage this content belongs to by checking all stages
        // In a real app we'd have a getContent(id) API that includes stage info
        // Here we have to search or assume we pass state
        const loadContent = async () => {
          let foundContent = null
          let foundStage = null
          let foundProgram = null
          
          for (const p of res.data) {
            const stgs = await programService.getStages(p.id)
            for (const s of stgs) {
              const contents = await programService.getContents(s.id)
              const c = contents.find(x => x.id === contentId)
              if (c) {
                foundContent = c
                foundStage = s
                foundProgram = p
                break
              }
            }
            if (foundContent) break
          }
          
          if (foundContent && foundProgram && foundStage) {
            setSelectedProgram(foundProgram.id)
            const pStages = await programService.getStages(foundProgram.id)
            setStages(pStages)
            setStageId(foundStage.id)
            setForm({
              title: foundContent.title,
              file_type: foundContent.file_type,
              file_url: foundContent.file_url,
              duration_seconds: foundContent.duration_seconds || 0,
              sort_order: foundContent.sort_order,
              is_active: foundContent.is_active,
            })
          }
          setLoading(false)
        }
        loadContent()
      } else {
        setLoading(false)
      }
    })
  }, [isEdit, contentId])

  const loadStages = useCallback(async (programId: string) => {
    if (!programId) {
      setStages([])
      return
    }
    const res = await programService.getStages(programId)
    setStages(res)
    setStageId('')
  }, [])

  const handleProgramChange = (programId: string) => {
    setSelectedProgram(programId)
    loadStages(programId)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stageId || !form.title) {
      addToast({ type: 'error', message: 'Lengkapi semua field yang wajib' })
      return
    }

    setSaving(true)
    try {
      if (isEdit && contentId) {
        await programService.updateContent(stageId, contentId, {
          title: form.title,
          file_type: form.file_type,
          file_url: form.file_url,
          duration_seconds: form.duration_seconds,
          is_active: form.is_active,
        })
        addToast({ type: 'success', message: 'Konten berhasil diperbarui' })
      } else {
        await programService.createContent(stageId, {
          title: form.title,
          file_type: form.file_type,
          file_url: form.file_url,
          duration_seconds: form.duration_seconds,
          sort_order: form.sort_order,
          is_active: form.is_active,
        })
        addToast({ type: 'success', message: 'Konten baru berhasil ditambahkan' })
      }
      navigate('/admin/content')
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
        subtitle={isEdit ? 'Perbarui detail konten stage' : 'Buat konten baru untuk stage'}
        breadcrumbs={[
          { label: 'Content Manager', href: '/admin/content' },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-4">
          <Select
            label="Program"
            required
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            value={selectedProgram}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder="Pilih Program"
          />

          <Select
            label="Stage"
            required
            options={stages.map((s) => ({ value: s.id, label: s.name }))}
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            placeholder="Pilih Stage"
            disabled={!selectedProgram}
          />

          <Input
            label="Judul Konten"
            required
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Contoh: Video Edukasi Sapi"
          />

          <Select
            label="Tipe File"
            required
            options={[
              { value: StageContentFileType.VIDEO, label: 'Video' },
              { value: StageContentFileType.IMAGE, label: 'Gambar' },
              { value: StageContentFileType.AUDIO, label: 'Audio' },
              { value: StageContentFileType.GAME_BUNDLE, label: 'Game' },
            ]}
            value={form.file_type}
            onChange={(e) => setForm((prev) => ({ ...prev, file_type: e.target.value as StageContentFileType }))}
          />

          <Input
            label="Durasi (Detik)"
            type="number"
            min="0"
            value={form.duration_seconds.toString()}
            onChange={(e) => setForm((prev) => ({ ...prev, duration_seconds: parseInt(e.target.value) || 0 }))}
          />

          <div className="border-2 border-dashed border-outline-variant rounded-2xl p-8 text-center cursor-pointer hover:bg-surface-container-low transition-colors">
            <Upload className="w-8 h-8 text-on-surface-variant mx-auto mb-2" />
            <p className="text-sm font-medium text-on-surface">Klik atau seret file ke sini</p>
            <p className="text-xs text-on-surface-variant mt-1">
              File URL saat ini: {form.file_url === 'placeholder_url' ? 'Belum ada file sungguhan' : form.file_url}
            </p>
          </div>
          
          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              className="accent-primary w-4 h-4 rounded border-outline-variant"
            />
            <span className="text-sm text-on-surface">Konten Aktif</span>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/admin/content')}>
            Batal
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {isEdit ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default ContentFormPage
