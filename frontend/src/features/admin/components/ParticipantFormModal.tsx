import { useState, useEffect } from 'react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'

type ParticipantFormData = {
  child_name: string
  child_age: number
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
}

interface ParticipantFormModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: ParticipantFormData) => Promise<void>
  mode: 'create' | 'edit'
  initialData?: ParticipantFormData
}

interface FormErrors {
  child_name?: string
  child_age?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
}

export function ParticipantFormModal({
  open,
  onClose,
  onSubmit,
  mode,
  initialData,
}: ParticipantFormModalProps) {
  const [formData, setFormData] = useState<ParticipantFormData>({
    child_name: '',
    child_age: 6,
    school_name: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setFormData(
        initialData || {
          child_name: '',
          child_age: 6,
          school_name: '',
          parent_name: '',
          parent_phone: '',
          parent_email: '',
        }
      )
      setErrors({})
    }
  }, [open, initialData])

  const validate = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.child_name.trim()) {
      newErrors.child_name = 'Nama anak harus diisi'
    }

    if (!formData.child_age || formData.child_age < 4 || formData.child_age > 10) {
      newErrors.child_age = 'Usia anak harus antara 4-10 tahun'
    }

    if (!formData.parent_name.trim()) {
      newErrors.parent_name = 'Nama orang tua harus diisi'
    }

    if (!formData.parent_phone.trim()) {
      newErrors.parent_phone = 'No. HP orang tua harus diisi'
    }

    // Email validation - optional but must be valid if filled
    if (formData.parent_email && formData.parent_email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.parent_email.trim())) {
        newErrors.parent_email = 'Format email tidak valid'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        child_name: formData.child_name.trim(),
        child_age: formData.child_age,
        school_name: formData.school_name?.trim() || undefined,
        parent_name: formData.parent_name.trim(),
        parent_phone: formData.parent_phone.trim(),
        parent_email: formData.parent_email?.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setErrors({ child_name: err instanceof Error ? err.message : 'Gagal menyimpan peserta' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'create' ? 'Tambah Peserta' : 'Edit Peserta'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          <Input
            label="Nama Anak"
            placeholder="Contoh: Budi Santoso"
            value={formData.child_name}
            onChange={(e) => setFormData({ ...formData, child_name: e.target.value })}
            error={errors.child_name}
            required
            autoFocus
          />

          <Input
            label="Usia Anak"
            type="number"
            min={4}
            max={10}
            placeholder="6"
            value={formData.child_age}
            onChange={(e) => setFormData({ ...formData, child_age: parseInt(e.target.value, 10) })}
            error={errors.child_age}
            hint="Usia antara 4-10 tahun"
            required
          />

          <Input
            label="Nama Sekolah"
            placeholder="Contoh: TK Harapan Bangsa (opsional)"
            value={formData.school_name}
            onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
          />

          <Input
            label="Nama Orang Tua"
            placeholder="Contoh: Andi Santoso"
            value={formData.parent_name}
            onChange={(e) => setFormData({ ...formData, parent_name: e.target.value })}
            error={errors.parent_name}
            required
          />

          <Input
            label="No. HP Orang Tua"
            type="tel"
            placeholder="Contoh: 081234567890"
            value={formData.parent_phone}
            onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
            error={errors.parent_phone}
            required
          />

          <Input
            label="Email Orang Tua"
            type="email"
            placeholder="Contoh: andi@mail.com (opsional)"
            value={formData.parent_email}
            onChange={(e) => setFormData({ ...formData, parent_email: e.target.value })}
            error={errors.parent_email}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {mode === 'create' ? 'Tambah' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
