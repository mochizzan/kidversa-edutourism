import { PARTICIPANT_AGE } from '@/core/constants/participant'
import { i18n } from '@/core/i18n'
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
  if (!trimmed) return i18n.t('validation.requiredWithLabel', { label })
  if (trimmed.length < 2 || trimmed.length > 200 || !/\p{L}/u.test(trimmed)) {
    return i18n.t('validation.lengthWithLabel', { label })
  }
  return undefined
}

export function validateParticipantForm(values: ParticipantFormValues): ParticipantFormErrors {
  const errors: ParticipantFormErrors = {}

  const childName = nameError(values.child_name, i18n.t('validation.fieldChildName'))
  if (childName) errors.child_name = childName

  const parentName = nameError(values.parent_name, i18n.t('validation.fieldParentName'))
  if (parentName) errors.parent_name = parentName

  const age = values.child_age.trim()
  if (!age) {
    errors.child_age = i18n.t('validation.ageRequired')
  } else if (!/^\d{1,3}$/.test(age)) {
    errors.child_age = i18n.t('validation.ageRange')
  } else {
    const n = Number.parseInt(age, 10)
    if (n < PARTICIPANT_AGE.HARD_MIN || n > PARTICIPANT_AGE.HARD_MAX) {
      errors.child_age = i18n.t('validation.ageRange')
    }
  }

  // Cleanup-only: satu-satunya aturan phone di FE adalah wajib diisi.
  if (!values.parent_phone.trim()) errors.parent_phone = i18n.t('validation.phoneRequired')

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
