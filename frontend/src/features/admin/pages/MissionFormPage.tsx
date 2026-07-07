import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { Program, ProgramStage } from '../../../core/types'
import { MissionCategory } from '../../../core/types'
import { cn } from '../../../core/utils'

const MissionFormPage = () => {
  const navigate = useNavigate()
  const { missionId } = useParams()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(missionId)

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [programs, setPrograms] = useState<Program[]>([])
  const [stages, setStages] = useState<ProgramStage[]>([])
  const [selectedStages, setSelectedStages] = useState<string[]>([])

  const [form, setForm] = useState({
    program_id: '',
    category: MissionCategory.HOME,
    title_child: '',
    title_parent: '',
    description_parent: '',
  })

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  useEffect(() => {
    if (isEdit && missionId) {
      missionService.getById(missionId).then((mission) => {
        if (mission) {
          setForm({
            program_id: mission.program_id,
            category: mission.category,
            title_child: mission.title_child,
            title_parent: mission.title_parent,
            description_parent: mission.description_parent || '',
          })
          setSelectedStages(mission.related_stage_ids || [])
          programService.getStages(mission.program_id).then(setStages)
        }
        setLoading(false)
      })
    }
  }, [isEdit, missionId])

  const loadStages = useCallback(async (programId: string) => {
    if (!programId) {
      setStages([])
      return
    }
    const res = await programService.getStages(programId)
    setStages(res)
    setSelectedStages([])
  }, [])

  const handleProgramChange = (programId: string) => {
    setForm((prev) => ({ ...prev, program_id: programId }))
    loadStages(programId)
  }

  const toggleStage = (stageId: string) => {
    setSelectedStages((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.program_id || !form.title_child || !form.title_parent) {
      addToast({ type: 'error', message: 'Lengkapi semua field yang wajib' })
      return
    }

    setSaving(true)
    try {
      if (isEdit && missionId) {
        await missionService.update(missionId, {
          program_id: form.program_id,
          category: form.category,
          title_child: form.title_child,
          title_parent: form.title_parent,
          description_parent: form.description_parent || undefined,
          related_stage_ids: selectedStages.length > 0 ? selectedStages : undefined,
        })
        addToast({ type: 'success', message: 'Misi berhasil diperbarui' })
      } else {
        await missionService.create({
          program_id: form.program_id,
          category: form.category,
          title_child: form.title_child,
          title_parent: form.title_parent,
          description_parent: form.description_parent || undefined,
          related_stage_ids: selectedStages.length > 0 ? selectedStages : undefined,
        })
        addToast({ type: 'success', message: 'Misi baru berhasil ditambahkan' })
      }
      navigate('/admin/missions')
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menyimpan misi' })
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
        title={isEdit ? 'Edit Misi' : 'Tambah Misi Baru'}
        subtitle={isEdit ? 'Perbarui detail misi' : 'Buat misi baru untuk program'}
        breadcrumbs={[
          { label: 'Bank Misi', href: '/admin/missions' },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-4">
          <Select
            label="Program"
            required
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            value={form.program_id}
            onChange={(e) => handleProgramChange(e.target.value)}
            placeholder="Pilih Program"
          />

          <Select
            label="Kategori"
            required
            options={[
              { value: MissionCategory.HOME, label: '🏠 HOME' },
              { value: MissionCategory.PARENT, label: '👨‍👩‍👧 PARENT' },
              { value: MissionCategory.SCHOOL, label: '🏫 SCHOOL' },
            ]}
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as MissionCategory }))}
          />

          <Input
            label="Judul (Anak)"
            required
            value={form.title_child}
            onChange={(e) => setForm((prev) => ({ ...prev, title_child: e.target.value }))}
            placeholder="Contoh: Gambar sapi kesukaanku"
          />

          <Input
            label="Judul (Orang Tua)"
            required
            value={form.title_parent}
            onChange={(e) => setForm((prev) => ({ ...prev, title_parent: e.target.value }))}
            placeholder="Contoh: Minta anak menggambar sapi yang paling berkesan"
          />

          <div className="w-full">
            <label className="block text-sm font-medium text-on-surface mb-1">
              Deskripsi (Orang Tua)
            </label>
            <textarea
              value={form.description_parent}
              onChange={(e) => setForm((prev) => ({ ...prev, description_parent: e.target.value }))}
              rows={3}
              placeholder="Jelaskan aktivitas yang harus dilakukan orang tua..."
              className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
            />
          </div>

          {stages.length > 0 && (
            <div className="w-full">
              <label className="block text-sm font-medium text-on-surface mb-2">
                Stage Terkait
              </label>
              <div className="grid grid-cols-2 gap-2">
                {stages.map((stage) => {
                  const isSelected = selectedStages.includes(stage.id)
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => toggleStage(stage.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-primary-container/30 text-primary'
                          : 'border-outline-variant text-on-surface hover:border-primary/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          isSelected ? 'bg-primary border-primary' : 'border-outline-variant'
                        )}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-on-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="truncate">{stage.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate('/admin/missions')}>
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

export default MissionFormPage
