import { describe, it, expect } from 'vitest'
import {
  validateParticipantForm,
  needsAgeConfirm,
  type ParticipantFormValues,
} from '@/core/utils/participantValidation'
import { PARTICIPANT_AGE_ERROR } from '@/core/constants/participant'

const valid = (): ParticipantFormValues => ({
  child_name: 'Budi',
  child_age: '6',
  school_name: 'SD Harapan',
  parent_name: 'Santoso',
  parent_phone: '+628123123456',
  parent_email: 'budi@example.com',
})

describe('validateParticipantForm', () => {
  it('menerima form yang seluruhnya valid', () => {
    expect(validateParticipantForm(valid())).toEqual({})
  })

  it('child_name kosong → wajib diisi', () => {
    expect(validateParticipantForm({ ...valid(), child_name: '' }).child_name).toBe(
      'Nama anak harus diisi',
    )
  })

  it('child_name 1 karakter → aturan 2–200 + huruf', () => {
    expect(validateParticipantForm({ ...valid(), child_name: 'A' }).child_name).toBe(
      'Nama anak harus 2–200 karakter dan mengandung huruf',
    )
  })

  it('child_name > 200 karakter → tolak', () => {
    expect(validateParticipantForm({ ...valid(), child_name: 'a'.repeat(201) }).child_name).toBe(
      'Nama anak harus 2–200 karakter dan mengandung huruf',
    )
  })

  it('child_name hanya simbol (emoji) → tolak', () => {
    expect(validateParticipantForm({ ...valid(), child_name: '🌟🌟' }).child_name).toBe(
      'Nama anak harus 2–200 karakter dan mengandung huruf',
    )
  })

  it('parent_name kosong → wajib diisi', () => {
    expect(validateParticipantForm({ ...valid(), parent_name: '' }).parent_name).toBe(
      'Nama orang tua harus diisi',
    )
  })

  it('parent_name tanpa huruf → tolak', () => {
    expect(validateParticipantForm({ ...valid(), parent_name: '12' }).parent_name).toBe(
      'Nama orang tua harus 2–200 karakter dan mengandung huruf',
    )
  })

  it('child_age kosong → wajib diisi (tanpa default)', () => {
    expect(validateParticipantForm({ ...valid(), child_age: '' }).child_age).toBe(
      'Usia anak wajib diisi',
    )
  })

  it.each(['0', '121', 'abc'])('child_age %s → di luar batas keras', (age) => {
    expect(validateParticipantForm({ ...valid(), child_age: age }).child_age).toBe(
      PARTICIPANT_AGE_ERROR,
    )
  })

  it.each(['1', '120'])('child_age %s → diterima', (age) => {
    expect(validateParticipantForm({ ...valid(), child_age: age }).child_age).toBeUndefined()
  })

  it('parent_phone kosong → wajib diisi', () => {
    expect(validateParticipantForm({ ...valid(), parent_phone: '  ' }).parent_phone).toBe(
      'No. HP orang tua wajib diisi',
    )
  })

  it('parent_phone non-kosong tidak di-cap format apa pun', () => {
    const errs = validateParticipantForm({ ...valid(), parent_phone: 'bukan-nomor!!' })
    expect(errs.parent_phone).toBeUndefined()
  })

  it('school_name tetap tidak divalidasi FE (tanpa key error)', () => {
    const errs = validateParticipantForm({ ...valid(), school_name: '' })
    expect('school_name' in errs).toBe(false)
  })

  it("parent_email '' / dihapus → tanpa key error", () => {
    expect('parent_email' in validateParticipantForm({ ...valid(), parent_email: '' })).toBe(false)
    expect(
      'parent_email' in validateParticipantForm({ ...valid(), parent_email: undefined }),
    ).toBe(false)
  })

  it("parent_email valid → tanpa error", () => {
    expect(
      validateParticipantForm({ ...valid(), parent_email: 'budi@example.com' }).parent_email,
    ).toBeUndefined()
  })

  it("parent_email 'budi@' → Format email tidak valid", () => {
    expect(validateParticipantForm({ ...valid(), parent_email: 'budi@' }).parent_email).toBe(
      'Format email tidak valid',
    )
  })

  it("parent_email berspasi valid ' budi@example.com ' → tanpa error (trim dulu)", () => {
    expect(
      validateParticipantForm({ ...valid(), parent_email: ' budi@example.com ' }).parent_email,
    ).toBeUndefined()
  })
})

describe('needsAgeConfirm', () => {
  it.each([
    [3, true],
    [4, false],
    [17, false],
    [18, true],
  ])('usia %i → %s', (age, expected) => {
    expect(needsAgeConfirm(age)).toBe(expected)
  })
})
