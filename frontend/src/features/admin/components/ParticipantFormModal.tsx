import { useState, useEffect, useMemo } from 'react'
import { Search, User } from 'lucide-react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { cn } from '../../../core/utils'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Participant } from '../../../core/types'
import { isValidEmail } from '../../../core/utils/validation'

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
  mode: 'create' | 'edit'
  selectOnly?: boolean
  onSubmit?: (data: ParticipantFormData) => Promise<void>
  initialData?: ParticipantFormData
  availableParticipants?: Participant[]
  onLinkExisting?: (participantId: string) => Promise<void>
  linkedParticipantIds?: string[]
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
  selectOnly,
  initialData,
  availableParticipants,
  onLinkExisting,
  linkedParticipantIds,
}: ParticipantFormModalProps) {
  const [formData, setFormData] = useState<ParticipantFormData>({
    child_name: '',
    child_age: 6,
    school_name: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
  })
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectError, setSelectError] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedParticipantId('')
      setSearchQuery('')
      setSelectError('')
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

  const filteredParticipants = useMemo(() => {
    if (!availableParticipants) return []
    if (!searchQuery.trim()) return availableParticipants
    const q = searchQuery.toLowerCase()
    return availableParticipants.filter(p =>
      p.child_name.toLowerCase().includes(q) ||
      p.parent_name.toLowerCase().includes(q) ||
      p.school_name?.toLowerCase().includes(q)
    )
  }, [availableParticipants, searchQuery])

  const handleSelectConfirm = async () => {
    if (!selectedParticipantId || !onLinkExisting) return
    setSubmitting(true)
    setSelectError('')
    try {
      await onLinkExisting(selectedParticipantId)
      onClose()
    } catch (err) {
      setSelectError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

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
      if (!isValidEmail(formData.parent_email.trim())) {
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
    if (!onSubmit) return

    setSubmitting(true)
    try {
      const validatedData: ParticipantFormData = {
        child_name: formData.child_name.trim(),
        child_age: formData.child_age,
        school_name: formData.school_name?.trim() || undefined,
        parent_name: formData.parent_name.trim(),
        parent_phone: formData.parent_phone.trim(),
        parent_email: formData.parent_email?.trim() || undefined,
      }
      await onSubmit(validatedData)
      onClose()
    } catch (err) {
      setErrors({ child_name: friendlyError(err) })
    } finally {
      setSubmitting(false)
    }
  }

  if (selectOnly && mode === 'create') {
    return (
      <Modal open={open} onClose={onClose} title="Tambah Peserta" size="lg">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Cari nama peserta..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectError('') }}
            className="w-full rounded-xl border border-outline-variant bg-surface pl-10 pr-3 py-2 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
            autoFocus
          />
        </div>

        {selectError && (
          <div className="mb-3 p-3 rounded-xl bg-error-container/30 text-on-error-container text-sm">{selectError}</div>
        )}

        {!availableParticipants || availableParticipants.length === 0 ? (
          <EmptyState icon={<User className="w-12 h-12" />} title="Belum ada peserta yang tersedia" description="Buat data peserta terlebih dahulu dari menu Peserta." />
        ) : filteredParticipants.length === 0 ? (
          <p className="text-center py-8 text-on-surface-variant text-sm">Peserta tidak ditemukan</p>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredParticipants.map(p => {
              const isLinked = linkedParticipantIds?.includes(p.id) ?? false
              return (
                <div
                  key={p.id}
                  onClick={isLinked ? undefined : () => { setSelectedParticipantId(p.id); setSelectError('') }}
                  className={cn(
                    'p-4 rounded-xl border transition-colors',
                    isLinked
                      ? 'border-outline-variant/50 opacity-60 cursor-not-allowed'
                      : 'cursor-pointer',
                    !isLinked && selectedParticipantId === p.id
                      ? 'border-primary bg-primary-container/20'
                      : !isLinked && 'border-outline-variant hover:bg-surface-container-low'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-on-surface">{p.child_name}</span>
                        <Badge variant="neutral" size="sm">{p.child_age} th</Badge>
                      </div>
                      {p.school_name && <p className="text-sm text-on-surface-variant mt-0.5">{p.school_name}</p>}
                      <p className="text-sm text-on-surface-variant">{p.parent_name} · {p.parent_phone}</p>
                      {p.parent_email && <p className="text-xs text-on-surface-variant">{p.parent_email}</p>}
                    </div>
                    {isLinked ? (
                      <Badge variant="primary" size="sm">Sudah Ditambahkan</Badge>
                    ) : (
                      <div className="flex gap-1">
                        <Badge variant={p.consent_recording ? 'success' : 'danger'} size="sm">Recording</Badge>
                        <Badge variant={p.consent_photo ? 'success' : 'danger'} size="sm">Photo</Badge>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-outline-variant">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Batal</Button>
          <Button onClick={handleSelectConfirm} disabled={!selectedParticipantId || submitting} loading={submitting}>Tambahkan</Button>
        </div>
      </Modal>
    )
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
