import { describe, it, expect } from 'vitest'
import { createUserSchema, updateUserSchema } from '@/features/admin/pages/UserFormPage'
import { registerSchema } from '@/features/auth/pages/RegisterPage'
import { changePasswordSchema } from '@/features/auth/pages/ChangePasswordPage'
import { zPassword } from '@/core/utils/validation'
import { UserRole } from '@/core/types'

// Base payload valid per schema — supaya ONLY field yang diuji yang menentukan hasil.
const baseUsers = {
  name: 'Budi Santoso',
  email: 'budi@mail.com',
  password: 'Abcd1234',
  confirmPassword: 'Abcd1234',
  phone: '',
  role: UserRole.KOORDINATOR,
}

const baseRegister = {
  name: 'Budi Santoso',
  email: 'budi@mail.com',
  password: 'Abcd1234',
  confirmPassword: 'Abcd1234',
  tenant_id: 't1',
  role: UserRole.KOORDINATOR,
  terms: true,
  honeypot: '',
}

describe('schema parity: register ↔ users', () => {
  it('kedua base payload valid (field di bawah test sendirian yang memutuskan)', () => {
    expect(createUserSchema.safeParse(baseUsers).success).toBe(true)
    expect(registerSchema.safeParse(baseRegister).success).toBe(true)
  })

  const passwordFixtures = ['abcdefgh', 'ABCDEFGH', 'Abcdefgh', 'Abcdefg', 'Aaaaaa1a'] as const

  it.each(passwordFixtures)('password %s → outcome identik di kedua schema', (f) => {
    const a = createUserSchema.safeParse({ ...baseUsers, password: f, confirmPassword: f })
    const b = registerSchema.safeParse({ ...baseRegister, password: f, confirmPassword: f })
    expect(a.success).toBe(b.success)
    if (!a.success && !b.success) {
      expect(a.error.issues[0].path).toEqual(b.error.issues[0].path)
      expect(a.error.issues[0].path[0]).toBe('password')
      expect(a.error.issues[0].message).toBe(b.error.issues[0].message)
    }
  })

  const emailFixtures = ['', 'budi@', 'budi@mail', 'budi@mail.com'] as const

  it.each(emailFixtures)('email %s → outcome identik di kedua schema', (e) => {
    const a = createUserSchema.safeParse({ ...baseUsers, email: e })
    const b = registerSchema.safeParse({ ...baseRegister, email: e })
    expect(a.success).toBe(b.success)
    if (!a.success && !b.success) {
      expect(a.error.issues[0].path).toEqual(b.error.issues[0].path)
      expect(a.error.issues[0].path[0]).toBe('email')
      expect(a.error.issues[0].message).toBe(b.error.issues[0].message)
    }
  })

  it.each([
    ['', 'Email wajib diisi'],
    ['budi@', 'Format email tidak valid'],
    ['budi@mail', 'Format email tidak valid'],
  ] as const)('email %s gagal dengan pesan persis %s di kedua schema', (e, message) => {
    const a = createUserSchema.safeParse({ ...baseUsers, email: e })
    const b = registerSchema.safeParse({ ...baseRegister, email: e })
    expect(a.success).toBe(false)
    expect(!a.success && a.error.issues[0].message).toBe(message)
    expect(!b.success && b.error.issues[0].message).toBe(message)
  })
})

describe('changePasswordSchema: new_password = zPassword, old_password tetap lunak', () => {
  const passwordFixtures = ['abcdefgh', 'ABCDEFGH', 'Abcdefgh', 'Abcdefg', 'Aaaaaa1a'] as const

  it.each(passwordFixtures)('new_password %s → outcome identik dengan zPassword', (f) => {
    const direct = zPassword.safeParse(f)
    const result = changePasswordSchema.safeParse({
      old_password: 'abcdefgh',
      new_password: f,
      confirm: f,
    })
    expect(result.success).toBe(direct.success)
    if (!result.success && !direct.success) {
      expect(result.error.issues[0].path[0]).toBe('new_password')
      expect(result.error.issues[0].message).toBe(direct.error.issues[0].message)
    }
  })

  it("old_password lemah ('abcdefgh') tetap diterima selama new_password kuat", () => {
    expect(
      changePasswordSchema.safeParse({
        old_password: 'abcdefgh',
        new_password: 'Abcd1234',
        confirm: 'Abcd1234',
      }).success,
    ).toBe(true)
  })
})

describe('updateUserSchema: phone opsional tapi dicek format', () => {
  const base = {
    name: 'Budi Santoso',
    email: 'budi@mail.com',
    role: UserRole.KOORDINATOR,
  }

  it("phone '' → success", () => {
    expect(updateUserSchema.safeParse({ ...base, phone: '' }).success).toBe(true)
  })

  it("phone '123' → gagal 'Nomor telepon tidak valid'", () => {
    const result = updateUserSchema.safeParse({ ...base, phone: '123' })
    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0].message).toBe('Nomor telepon tidak valid')
  })

  it("phone asing '+6591234567' → success", () => {
    expect(updateUserSchema.safeParse({ ...base, phone: '+6591234567' }).success).toBe(true)
  })
})
