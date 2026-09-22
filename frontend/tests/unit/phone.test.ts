import { describe, it, expect } from 'vitest'
import { combinePhone, detectCountry, getCountryOptions } from '@/core/utils/phone'

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
  it('memuat Indonesia dengan dial code, nama, dan bendera', () => {
    const id = getCountryOptions().find((c) => c.iso === 'ID')
    expect(id).toBeDefined()
    expect(id!.dialCode).toBe('62')
    expect(id!.name).toBe('Indonesia')
    expect(id!.flag).toBe('🇮🇩')
  })
})
