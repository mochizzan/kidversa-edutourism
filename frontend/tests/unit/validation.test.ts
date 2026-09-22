import { describe, it, expect } from 'vitest'
import { emailError, phoneError, zEmail, zPhone, zPassword } from '@/core/utils/validation'

describe('emailError', () => {
  it("'' + required → 'Email wajib diisi'", () => {
    expect(emailError('', { required: true })).toBe('Email wajib diisi')
  })

  it("'   ' + required → 'Email wajib diisi'", () => {
    expect(emailError('   ', { required: true })).toBe('Email wajib diisi')
  })

  it.each(['', '   '])('%p + optional → undefined', (input) => {
    expect(emailError(input, { required: false })).toBeUndefined()
  })

  it("'budi@mail.com' + required → undefined", () => {
    expect(emailError('budi@mail.com', { required: true })).toBeUndefined()
  })

  it("'budi.santoso+tag@domain.co.id' + optional → undefined", () => {
    expect(emailError('budi.santoso+tag@domain.co.id', { required: false })).toBeUndefined()
  })

  it("' budi@mail.com ' + required → undefined (di-trim dulu)", () => {
    expect(emailError(' budi@mail.com ', { required: true })).toBeUndefined()
  })

  it.each(['budi@', 'budi@mail', '@mail.com', 'budi mail.com', 'budi@.com'])(
    '%p + optional → Format email tidak valid',
    (input) => {
      expect(emailError(input, { required: false })).toBe('Format email tidak valid')
    },
  )
})

describe('phoneError', () => {
  it("'' + optional → undefined", () => {
    expect(phoneError('', { required: false })).toBeUndefined()
  })

  it("'' + required → 'No. HP wajib diisi'", () => {
    expect(phoneError('', { required: true })).toBe('No. HP wajib diisi')
  })

  it("'081234567890' legacy + optional → undefined", () => {
    expect(phoneError('081234567890', { required: false })).toBeUndefined()
  })

  it("'+6281234567890' E.164 ID + optional → undefined", () => {
    expect(phoneError('+6281234567890', { required: false })).toBeUndefined()
  })

  it("'+6591234567' asing + optional → undefined", () => {
    expect(phoneError('+6591234567', { required: false })).toBeUndefined()
  })

  it("'  +6281234567890  ' dengan spasi + optional → undefined", () => {
    expect(phoneError('  +6281234567890  ', { required: false })).toBeUndefined()
  })

  it.each(['123', 'abc', '+999', '0812345'])('%p + optional → Nomor telepon tidak valid', (input) => {
    expect(phoneError(input, { required: false })).toBe('Nomor telepon tidak valid')
  })
})

describe('zEmail (zod wrapper)', () => {
  it("required menolak '' dengan pesan 'Email wajib diisi'", () => {
    const result = zEmail({ required: true }).safeParse('')
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0].message).toBe('Email wajib diisi')
  })

  it("required menerima ' budi@mail.com ' dan output di-trim", () => {
    const result = zEmail({ required: true }).safeParse(' budi@mail.com ')
    expect(result.success).toBe(true)
    expect(result.success && result.data).toBe('budi@mail.com')
  })

  it("optional menerima ''", () => {
    expect(zEmail({ required: false }).safeParse('').success).toBe(true)
  })
})

describe('zPhone (zod wrapper)', () => {
  const optionalPhone = zPhone({ required: false })

  it("optional menerima ''", () => {
    expect(optionalPhone.safeParse('').success).toBe(true)
  })

  it('optional menerima undefined', () => {
    expect(optionalPhone.safeParse(undefined).success).toBe(true)
  })

  it("menolak '123' dengan 'Nomor telepon tidak valid'", () => {
    const result = optionalPhone.safeParse('123')
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0].message).toBe('Nomor telepon tidak valid')
  })

  it("menerima '+6591234567'", () => {
    expect(optionalPhone.safeParse('+6591234567').success).toBe(true)
  })
})

describe('zPassword (aturan bersama register/users)', () => {
  it.each([
    ['Abcdefg', 'Password minimal 8 karakter'],
    ['abcdefgh', 'Harus ada huruf besar'],
    ['ABCDEFGH', 'Harus ada huruf kecil'],
    ['Abcdefgh', 'Harus ada angka'],
  ])('%p ditolak dengan pesan pertama %p', (password, message) => {
    const result = zPassword.safeParse(password)
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0].message).toBe(message)
  })

  it("menerima boundary 'Aaaaaa1a' (8 karakter, campur besar/kecil + angka)", () => {
    expect(zPassword.safeParse('Aaaaaa1a').success).toBe(true)
  })
})
