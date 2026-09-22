import { PARTICIPANT_AGE, PARTICIPANT_AGE_ERROR } from '@/core/constants/participant'
import { emailError } from './validation'

export type ParticipantFormValues = {
  child_name: string
  child_age: string
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
}

export type ParticipantFormErrors = {
  child_name?: string
  child_age?: string
  school_name?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
}

// Nama: setelah trim 2–200 karakter dan minimal satu huruf Unicode.
// school_name sengaja TIDAK divalidasi FE (backend yang handle).
const nameError = (value: string, label: string): string | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return `${label} harus diisi`
  if (trimmed.length < 2 || trimmed.length > 200 || !/\p{L}/u.test(trimmed)) {
    return `${label} harus 2–200 karakter dan mengandung huruf`
  }
  return undefined
}

export function validateParticipantForm(values: ParticipantFormValues): ParticipantFormErrors {
  const errors: ParticipantFormErrors = {}

  const childName = nameError(values.child_name, 'Nama anak')
  if (childName) errors.child_name = childName

  const parentName = nameError(values.parent_name, 'Nama orang tua')
  if (parentName) errors.parent_name = parentName

  const age = values.child_age.trim()
  if (!age) {
    errors.child_age = 'Usia anak wajib diisi'
  } else if (!/^\d{1,3}$/.test(age)) {
    errors.child_age = PARTICIPANT_AGE_ERROR
  } else {
    const n = Number.parseInt(age, 10)
    if (n < PARTICIPANT_AGE.HARD_MIN || n > PARTICIPANT_AGE.HARD_MAX) {
      errors.child_age = PARTICIPANT_AGE_ERROR
    }
  }

  // Cleanup-only: satu-satunya aturan phone di FE adalah wajib diisi.
  if (!values.parent_phone.trim()) errors.parent_phone = 'No. HP orang tua wajib diisi'

  const email = values.parent_email?.trim()
  if (email) {
    const err = emailError(email, { required: false })
    if (err) errors.parent_email = err
  }

  return errors
}

export function needsAgeConfirm(age: number): boolean {
  return age < PARTICIPANT_AGE.SOFT_MIN || age > PARTICIPANT_AGE.SOFT_MAX
}
