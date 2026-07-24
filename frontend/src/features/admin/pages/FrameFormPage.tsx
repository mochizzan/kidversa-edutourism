import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Save, Loader2, Image } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Input } from '../../../shared/components/ui/Input'
import { Select } from '../../../shared/components/ui/Select'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { frameService } from '../../../core/services/frames'
import { programService } from '../../../core/services/programs'
import { getMediaUrl } from '../../../core/utils/media'
import type { Program } from '../../../core/types'

const FrameFormPage = () => {
  const navigate = useNavigate()
  const { frameId } = useParams()
  const { addToast } = useGlobalToast()

  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [programs, setPrograms] = useState<Program[]>([])

  const [form, setForm] = useState({
    name: '',
    program_id: '',
    file_url: '',
    thumbnail_url: '',
  })

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  useEffect(() => {
    if (frameId) {
      const loadFrame = async () => {
        try {
          const res = await frameService.getAll({ limit: 1000 })
          const frame = res.data.find(f => f.id === frameId)
          if (frame) {
            setForm({
              name: frame.name,
              program_id: frame.program_id || '',
              file_url: frame.file_url || '',
              thumbnail_url: frame.thumbnail_url || '',
            })
          } else {
            addToast({ type: 'error', message: 'Frame tidak ditemukan' })
            navigate(ROUTES.ADMIN.FRAMES)
          }
        } catch {
          addToast({ type: 'error', message: 'Gagal memuat frame' })
        } finally {
          setLoading(false)
        }
      }
      loadFrame()
    }
  }, [frameId, addToast, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !frameId) {
      addToast({ type: 'error', message: 'Lengkapi semua field yang wajib' })
      return
    }

    setSaving(true)
    try {
      await frameService.update(frameId, {
        name: form.name,
        program_id: form.program_id || undefined,
      })
      addToast({ type: 'success', message: 'Frame berhasil diperbarui' })
      navigate(ROUTES.ADMIN.FRAMES)
    } catch {
      addToast({ type: 'error', message: 'Gagal menyimpan frame' })
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
        title="Edit Frame"
        subtitle="Perbarui detail frame"
        breadcrumbs={[
          { label: 'Frames', href: ROUTES.ADMIN.FRAMES },
          { label: 'Edit' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="bg-surface rounded-2xl p-6 shadow-sm space-y-4 flex flex-col md:flex-row gap-6">
          <div className="flex-1 space-y-4">
            <Input
              label="Nama Frame"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />

            <Select
              label="Program"
              options={[
                { value: '', label: 'Semua Program' },
                ...programs.map((p) => ({ value: p.id, label: p.name }))
              ]}
              value={form.program_id}
              onChange={(e) => setForm((prev) => ({ ...prev, program_id: e.target.value }))}
            />
          </div>
          
          <div className="w-full md:w-48 shrink-0">
            <label className="block text-sm font-medium text-on-surface mb-1">Preview</label>
            <div className="w-full aspect-[4/3] rounded-xl bg-surface-container-high flex items-center justify-center overflow-hidden border border-outline-variant">
              {form.thumbnail_url || form.file_url ? (
                <img
                  src={frameId ? getMediaUrl('frame', frameId) : undefined}
                  alt={form.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image className="w-8 h-8 text-on-surface-variant/50" />
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.FRAMES)}>
            Batal
          </Button>
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            Simpan
          </Button>
        </div>
      </form>
    </div>
  )
}

export default FrameFormPage
