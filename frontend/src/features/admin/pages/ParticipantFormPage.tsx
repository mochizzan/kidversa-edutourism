import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Baby, Loader2, Save, Users } from 'lucide-react'
import { ROUTES } from '../../../core/constants/app'
import {
  PARTICIPANT_AGE,
  PARTICIPANT_AGE_ERROR,
} from '../../../core/constants/participant'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { Input } from '../../../shared/components/ui/Input'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import { ApiError } from '../../../core/services/backendClient'
import { friendlyError } from '../../../core/utils/errorMessages'
import { isValidEmail } from '../../../core/utils/validation'
import { redirectToLogin } from '../../../core/stores/authStore'

type ParticipantFormState = {
  child_name: string
  child_age: string
  school_name: string
  parent_name: string
  parent_phone: string
  parent_email: string
}

type ParticipantFormErrors = {
  child_name?: string
  child_age?: string
  school_name?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
}

const emptyForm: ParticipantFormState = {
  child_name: '',
  child_age: String(PARTICIPANT_AGE.DEFAULT),
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
  const [errors, setErrors] = useState<ParticipantFormErrors>({})

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

  const validate = (): boolean => {
    const next: ParticipantFormErrors = {}
    const childAge = Number.parseInt(form.child_age, 10)

    if (!form.child_name.trim()) {
      next.child_name = 'Nama anak harus diisi'
    }

    if (!Number.isInteger(childAge) || childAge < PARTICIPANT_AGE.MIN || childAge > PARTICIPANT_AGE.MAX) {
      next.child_age = PARTICIPANT_AGE_ERROR
    }

    if (!form.parent_name.trim()) {
      next.parent_name = 'Nama orang tua harus diisi'
    }

    if (!form.parent_phone.trim()) {
      next.parent_phone = 'No. HP orang tua harus diisi'
    }

    const trimmedEmail = form.parent_email.trim()
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      next.parent_email = 'Format email tidak valid'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleChange = (key: keyof ParticipantFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    const childAge = Number.parseInt(form.child_age, 10)
    const trimmedEmail = form.parent_email.trim()

    setSaving(true)
    try {
      // The backend exposes participant writes only via per-session routes
      // (it has no global create/update). The standalone participant form has
      // no session context, so writes are routed through the session that the
      // participant is linked to. If the participant is not yet attached to a
      // session, editing/creating here is unsupported by the backend.
      if (isEdit && participantId) {
        const existing = await participantService.getById(participantId)
        if (!existing?.session_id) {
          addToast({ type: 'error', message: 'Peserta belum terikat sesi; edit melalui halaman sesi' })
          return
        }
        await sessionService.updateParticipant(existing.session_id, participantId, {
          child_name: form.child_name.trim(),
          child_age: childAge,
          school_name: form.school_name.trim() || undefined,
          parent_name: form.parent_name.trim(),
          parent_phone: form.parent_phone.trim(),
          parent_email: trimmedEmail || undefined,
        })
        addToast({ type: 'success', message: 'Peserta berhasil diperbarui' })
      } else {
        await participantService.create({
          child_name: form.child_name.trim(),
          child_age: childAge,
          school_name: form.school_name.trim() || undefined,
          parent_name: form.parent_name.trim(),
          parent_phone: form.parent_phone.trim(),
          parent_email: trimmedEmail || undefined,
        })
        addToast({ type: 'success', message: 'Peserta berhasil ditambahkan' })
      }

      navigate(ROUTES.ADMIN.PARTICIPANTS)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          redirectToLogin()
          return
        }
        addToast({ type: 'error', message: friendlyError(err) })
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

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl" noValidate>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-primary shrink-0">
              <Baby className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-semibold text-on-surface">Data Anak</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nama Anak *"
              required
              autoFocus
              value={form.child_name}
              onChange={(e) => handleChange('child_name', e.target.value)}
              placeholder="Contoh: Budi Santoso"
              error={errors.child_name}
            />

            <Input
              label="Usia Anak *"
              type="number"
              min={PARTICIPANT_AGE.MIN}
              max={PARTICIPANT_AGE.MAX}
              required
              value={form.child_age}
              onChange={(e) => handleChange('child_age', e.target.value)}
              placeholder={String(PARTICIPANT_AGE.DEFAULT)}
              hint={`Usia antara ${PARTICIPANT_AGE.MIN}-${PARTICIPANT_AGE.MAX} tahun`}
              error={errors.child_age}
            />

            <Input
              label="Nama Sekolah"
              value={form.school_name}
              onChange={(e) => handleChange('school_name', e.target.value)}
              placeholder="Contoh: TK Harapan Bangsa (opsional)"
            />
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-9 h-9 rounded-xl bg-primary-container flex items-center justify-center text-primary shrink-0">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-semibold text-on-surface">Data Orang Tua / Wali</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nama Orang Tua *"
              required
              value={form.parent_name}
              onChange={(e) => handleChange('parent_name', e.target.value)}
              placeholder="Contoh: Andi Santoso"
              error={errors.parent_name}
            />

            <Input
              label="No. HP Orang Tua *"
              type="tel"
              required
              value={form.parent_phone}
              onChange={(e) => handleChange('parent_phone', e.target.value)}
              placeholder="Contoh: 081234567890"
              error={errors.parent_phone}
            />

            <Input
              label="Email Orang Tua"
              type="email"
              value={form.parent_email}
              onChange={(e) => handleChange('parent_email', e.target.value)}
              placeholder="Contoh: andi@mail.com (opsional)"
              error={errors.parent_email}
            />
          </div>
        </Card>

        <p className="text-xs text-on-surface-variant">
          Field bertanda <span className="text-error font-medium">*</span> wajib diisi.
        </p>

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
