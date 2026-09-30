import { describe, expect, it } from 'vitest'
import {
  ORIGIN_PARAM,
  withOrigin,
  resolveCancelTarget,
} from '../../src/core/utils/navigation'

describe('withOrigin', () => {
  it('appends ?from= when the path has no query', () => {
    expect(withOrigin('/admin/topics/1/edit', '/admin/programs')).toBe(
      `/admin/topics/1/edit?${ORIGIN_PARAM}=${encodeURIComponent('/admin/programs')}`,
    )
  })

  it('appends &from= when the path already has a query', () => {
    expect(withOrigin('/admin/topics?programId=abc', '/admin/programs')).toBe(
      `/admin/topics?programId=abc&${ORIGIN_PARAM}=${encodeURIComponent('/admin/programs')}`,
    )
  })

  it('encodes origin queries so they round-trip through URLSearchParams', () => {
    const origin = '/admin/activities?programId=p1&stageId=s1'
    const stamped = withOrigin('/admin/activities/new', origin)
    const search = stamped.slice(stamped.indexOf('?'))
    expect(resolveCancelTarget(search, '/admin/activities')).toBe(origin)
  })
})

describe('resolveCancelTarget', () => {
  it('returns the module list fallback when no origin is stamped', () => {
    expect(resolveCancelTarget('', '/admin/topics')).toBe('/admin/topics')
    expect(resolveCancelTarget('?programId=abc', '/admin/topics')).toBe('/admin/topics')
  })

  it('returns the stamped origin so cancel goes back to the entry page', () => {
    const search = `?${ORIGIN_PARAM}=${encodeURIComponent('/admin/programs/123')}`
    expect(resolveCancelTarget(search, '/admin/topics')).toBe('/admin/programs/123')
  })

  it('preserves the origin query string (table filters survive the round trip)', () => {
    const origin = '/admin/topics?page=2&q=field%20trip'
    const search = `?${ORIGIN_PARAM}=${encodeURIComponent(origin)}`
    expect(resolveCancelTarget(search, '/admin/topics')).toBe(origin)
  })

  it.each([
    ['absolute URL', 'https://evil.example/steal'],
    ['protocol-relative host', '//evil.example/steal'],
    ['backslash trick', '/\\evil.example'],
  ])('rejects %s and falls back to the list path', (_label, raw) => {
    const search = `?${ORIGIN_PARAM}=${encodeURIComponent(raw)}`
    expect(resolveCancelTarget(search, '/admin/activities')).toBe('/admin/activities')
  })
})
