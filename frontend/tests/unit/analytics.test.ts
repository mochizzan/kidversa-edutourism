import { describe, it, expect } from 'vitest'
import {
  wibDateKey,
  todayWibDateKey,
  lastNDays,
  dateKeysBetween,
  buildDailySeries,
} from '@/features/admin/utils/analytics'

describe('wibDateKey', () => {
  it('shifts UTC timestamps past 17:00Z into the next WIB day', () => {
    // WIB = UTC+7. 17:30Z on 1 Sep is already 00:30 on 2 Sep in Jakarta.
    expect(wibDateKey('2026-09-01T17:30:00Z')).toBe('2026-09-02')
    expect(wibDateKey('2026-09-01T16:59:59Z')).toBe('2026-09-01')
    expect(wibDateKey('2026-09-01T10:00:00Z')).toBe('2026-09-01')
  })

  it('handles millisecond precision timestamps from the backend', () => {
    expect(wibDateKey('2026-09-01T17:30:00.123Z')).toBe('2026-09-02')
  })
})

describe('todayWibDateKey', () => {
  it('returns the WIB calendar date for an instant near UTC midnight', () => {
    expect(todayWibDateKey(new Date('2026-09-21T18:00:00Z'))).toBe('2026-09-22')
    expect(todayWibDateKey(new Date('2026-09-21T10:00:00Z'))).toBe('2026-09-21')
  })
})

describe('lastNDays', () => {
  it('produces N inclusive days ending today (WIB)', () => {
    const now = new Date('2026-09-22T03:00:00Z') // 10:00 WIB → 2026-09-22
    expect(lastNDays(7, now)).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ])
  })

  it('crosses a UTC month boundary using the WIB "today"', () => {
    // 2026-09-30T18:00Z is already 2026-10-01 in WIB.
    const now = new Date('2026-09-30T18:00:00Z')
    const keys = lastNDays(2, now)
    expect(keys).toEqual(['2026-09-30', '2026-10-01'])
  })
})

describe('dateKeysBetween', () => {
  it('is inclusive and ordered', () => {
    expect(dateKeysBetween('2026-09-01', '2026-09-03')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
  })

  it('caps the window at 366 days, keeping the most recent dates', () => {
    const keys = dateKeysBetween('2024-01-01', '2026-09-22')
    expect(keys.length).toBe(366)
    expect(keys[keys.length - 1]).toBe('2026-09-22')
  })

  it('returns [] for reversed or invalid input', () => {
    expect(dateKeysBetween('2026-09-03', '2026-09-01')).toEqual([])
    expect(dateKeysBetween('nope', '2026-09-01')).toEqual([])
  })
})

describe('buildDailySeries', () => {
  it('zero-fills days and buckets each metric by its own WIB date', () => {
    const series = buildDailySeries({
      dates: ['2026-09-20', '2026-09-21'],
      sessions: [{ session_date: '2026-09-20' }, { session_date: '2026-09-20' }, { session_date: '2026-09-19' }],
      participants: [
        { created_at: '2026-09-20T03:00:00Z' }, // 10:00 WIB → 20 Sep
        { created_at: '2026-09-20T18:00:00Z' }, // 01:00 WIB → 21 Sep (UTC/WIB rollover)
        { created_at: '2026-09-19T10:00:00Z' }, // outside the window → dropped
      ],
      assessments: [
        { star_rating: 5, assessed_at: '2026-09-20T05:00:00Z' },
        { star_rating: 3, assessed_at: '2026-09-20T05:00:00Z' },
      ],
    })

    expect(series).toEqual([
      {
        date: '2026-09-20',
        sessions: 2, // 19 Sep session is outside the window
        registrations: 1,
        assessments: 2,
        avgRating: 4,
      },
      {
        date: '2026-09-21',
        sessions: 0,
        registrations: 1,
        assessments: 0,
        avgRating: null, // no ratings that day → null, not 0
      },
    ])
  })

  it('rounds the average rating to one decimal', () => {
    const series = buildDailySeries({
      dates: ['2026-09-20'],
      sessions: [],
      participants: [],
      assessments: [
        { star_rating: 5, assessed_at: '2026-09-20T05:00:00Z' },
        { star_rating: 4, assessed_at: '2026-09-20T05:00:00Z' },
        { star_rating: 4, assessed_at: '2026-09-20T05:00:00Z' },
      ],
    })
    expect(series[0].avgRating).toBe(4.3)
  })
})
