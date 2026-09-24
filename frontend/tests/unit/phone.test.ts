import { describe, it, expect } from 'vitest'
import { combinePhone, detectCountry, getCountryOptions, normalizePhone } from '@/core/utils/phone'

describe('combinePhone', () => {
  it('membuang satu leading 0 lalu menggabung dial code', () => {
    expect(combinePhone('08123123456', '62')).toBe('+628123123456')
  })

  it('menggabung national tanpa leading 0', () => {
    expect(combinePhone('812', '62')).toBe('+62812')
  })

  it('national kosong → string kosong', () => {
    expect(combinePhone('', '62')).toBe('')
  })
})

describe('detectCountry', () => {
  it('mendeteksi +62 sebagai ID', () => {
    expect(detectCountry('+628123456789')).toEqual({
      iso: 'ID',
      dialCode: '62',
      national: '8123456789',
    })
  })

  it('mendeteksi +1 sebagai US (mitra kanonik)', () => {
    expect(detectCountry('+12133734253')).toEqual({
      iso: 'US',
      dialCode: '1',
      national: '2133734253',
    })
  })

  it('nilai legacy lokal → ID tanpa leading 0', () => {
    expect(detectCountry('08123123456')).toEqual({
      iso: 'ID',
      dialCode: '62',
      national: '8123123456',
    })
  })
})

describe('getCountryOptions', () => {
  it('memuat Indonesia dengan dial code dan nama', () => {
    const id = getCountryOptions().find((c) => c.iso === 'ID')
    expect(id).toBeDefined()
    expect(id!.dialCode).toBe('62')
    expect(id!.name).toBe('Indonesia')
    expect('flag' in id!).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('input E.164 non-Indonesia (+65…) lolos tanpa disandera +62', () => {
    expect(normalizePhone('+6512345678')).toBe('+6512345678')
  })

  it('input E.164 Indonesia (+62…) dipertahankan apa adanya', () => {
    expect(normalizePhone('+6281234567890')).toBe('+6281234567890')
  })

  it('legacy lokal leading 0 → +62', () => {
    expect(normalizePhone('081234567890')).toBe('+6281234567890')
  })

  it('legacy tanpa leading 0 (62…) → +62', () => {
    expect(normalizePhone('6281234567890')).toBe('+6281234567890')
  })

  it('empty/whitespace/undefined → undefined', () => {
    expect(normalizePhone('')).toBeUndefined()
    expect(normalizePhone(undefined)).toBeUndefined()
    expect(normalizePhone('   ')).toBeUndefined()
  })
})
