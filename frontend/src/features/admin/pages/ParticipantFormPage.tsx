import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Loader2, Save } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { participantService } from '../../../core/services/participants'
import { ApiError } from '../../../core/services/backendClient'
import { redirectToLogin } from '../../../core/stores/authStore'
import type { CreateParticipantDTO } from '../../../core/types'

type ParticipantFormState = {
  child_name: string
  child_age: string
  school_name: string
  parent_name: string
  parent_phone: string
  parent_email: string
}

const emptyForm: ParticipantFormState = {
  child_name: '',
  child_age: '6',
  school_name: '',
  parent_name: '',
  parent_phone: '',
  parent_email: '',
}

const ParticipantFormPage = () => {
  const { participantId } = useParams<{ participantId: string }>()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const isEdit = Boolean(participantId)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ParticipantFormState>(emptyForm)

  useEffect(() => {
    if (!isEdit || !participantId) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadParticipant = async () => {
      try {
        const found = await participantService.getById(participantId)
        if (cancelled) return

        if (!found) {
          addToast({ type: 'error', message: 'Peserta tidak ditemukan' })
          navigate(ROUTES.ADMIN.PARTICIPANTS, { replace: true })
          return
        }

        setForm({
          child_name: found.child_name,
          child_age: String(found.child_age),
          school_name: found.school_name || '',
          parent_name: found.parent_name,
          parent_phone: found.parent_phone,
          parent_email: found.parent_email || '',
        })
      } catch {
        if (!cancelled) {
          addToast({ type: 'error', message: 'Gagal memuat data peserta' })
          navigate(ROUTES.ADMIN.PARTICIPANTS, { replace: true })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadParticipant()

    return () => {
      cancelled = true
    }
  }, [isEdit, participantId, addToast, navigate])

  const validate = () => {
    const childAge = Number.parseInt(form.child_age, 10)

    if (!form.child_name.trim()) {
      addToast({ type: 'error', message: 'Nama anak harus diisi' })
      return null
    }

    if (!Number.isInteger(childAge) || childAge < 4 || childAge > 10) {
      addToast({ type: 'error', message: 'Usia anak harus antara 4-10 tahun' })
      return null
    }

    if (!form.parent_name.trim()) {
      addToast({ type: 'error', message: 'Nama orang tua harus diisi' })
      return null
    }

    if (!form.parent_phone.trim()) {
      addToast({ type: 'error', message: 'No. HP orang tua harus diisi' })
      return null
    }

    const trimmedEmail = form.parent_email.trim()
    if (trimmedEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(trimmedEmail)) {
        addToast({ type: 'error', message: 'Format email tidak valid' })
        return null
      }
    }

    return {
      child_name: form.child_name.trim(),
      child_age: childAge,
      school_name: form.school_name.trim() || undefined,
      parent_name: form.parent_name.trim(),
      parent_phone: form.parent_phone.trim(),
      parent_email: trimmedEmail || undefined,
    }
  }

  const handleChange = (key: keyof ParticipantFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const payload = validate()
    if (!payload) return

    setSaving(true)
    try {
      if (isEdit && participantId) {
        await participantService.update(participantId, payload)
        addToast({ type: 'success', message: 'Peserta berhasil diperbarui' })
      } else {
        await participantService.create(payload as CreateParticipantDTO)
        addToast({ type: 'success', message: 'Peserta berhasil ditambahkan' })
      }

      navigate(ROUTES.ADMIN.PARTICIPANTS)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          redirectToLogin()
          return
        }
        addToast({ type: 'error', message: err.message || 'Gagal menyimpan peserta' })
      } else {
        addToast({ type: 'error', message: 'Gagal menyimpan peserta' })
      }
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
        title={isEdit ? 'Edit Peserta' : 'Tambah Peserta Baru'}
        subtitle={isEdit ? 'Perbarui data peserta' : 'Buat data peserta baru tanpa penempatan sesi'}
        breadcrumbs={[
          { label: 'Peserta', href: ROUTES.ADMIN.PARTICIPANTS },
          { label: isEdit ? 'Edit' : 'Tambah' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nama Anak"
              required
              value={form.child_name}
              onChange={(e) => handleChange('child_name', e.target.value)}
              placeholder="Contoh: Budi Santoso"
            />

            <Input
              label="Usia Anak"
              type="number"
              min={4}
              max={10}
              required
              value={form.child_age}
              onChange={(e) => handleChange('child_age', e.target.value)}
              placeholder="6"
              hint="Usia antara 4-10 tahun"
            />

            <Input
              label="Nama Sekolah"
              value={form.school_name}
              onChange={(e) => handleChange('school_name', e.target.value)}
              placeholder="Contoh: TK Harapan Bangsa (opsional)"
            />

            <Input
              label="Nama Orang Tua"
              required
              value={form.parent_name}
              onChange={(e) => handleChange('parent_name', e.target.value)}
              placeholder="Contoh: Andi Santoso"
            />

            <Input
              label="No. HP Orang Tua"
              type="tel"
              required
              value={form.parent_phone}
              onChange={(e) => handleChange('parent_phone', e.target.value)}
              placeholder="Contoh: 081234567890"
            />

            <Input
              label="Email Orang Tua"
              type="email"
              value={form.parent_email}
              onChange={(e) => handleChange('parent_email', e.target.value)}
              placeholder="Contoh: andi@mail.com (opsional)"
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => navigate(ROUTES.ADMIN.PARTICIPANTS)}>
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

export default ParticipantFormPage
