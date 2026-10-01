import { describe, it, expect } from 'vitest'
import { splitBadgeSlots, type SplitBadge } from '@/core/utils/badgeSlots'

const badge = (
  name: string,
  extra: Partial<SplitBadge> = {},
): SplitBadge => ({ badgeName: name, ...extra })

describe('splitBadgeSlots — split dua slot (kontrak Fase 2 D2)', () => {
  it('split by type + stage: SUBTOPIK stage aktif → kiri; stage lain → gugur; FINAL → kanan', () => {
    const result = splitBadgeSlots(
      [
        badge('Topik A', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-a' }),
        badge('Topik B', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-b' }),
        badge('Final', { badge_type: 'FINAL', program_stage_id: null }),
      ],
      'stage-a',
    )
    expect(result.topicBadges.map((b) => b.badgeName)).toEqual(['Topik A'])
    expect(result.finalBadge?.badgeName).toBe('Final')
  })

  it('report legacy (programStageId kosong) → SEMUA SUBTOPIK di slot kiri', () => {
    const result = splitBadgeSlots(
      [
        badge('Topik A', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-a' }),
        badge('Topik B', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-b' }),
        badge('Final', { badge_type: 'FINAL', program_stage_id: null }),
      ],
      '',
    )
    expect(result.topicBadges.map((b) => b.badgeName)).toEqual(['Topik A', 'Topik B'])
    expect(result.finalBadge?.badgeName).toBe('Final')
  })

  it('programStageId undefined/null → diperlakukan legacy (semua SUBTOPIK di kiri)', () => {
    const rows = [badge('Topik A', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-a' })]
    expect(splitBadgeSlots(rows, undefined).topicBadges).toHaveLength(1)
    expect(splitBadgeSlots(rows, null).topicBadges).toHaveLength(1)
  })

  it('FINAL → kanan, maksimal SATU (ambils yang pertama bila ada lebih dari satu)', () => {
    const result = splitBadgeSlots(
      [
        badge('Final 1', { badge_type: 'FINAL', program_stage_id: null }),
        badge('Final 2', { badge_type: 'FINAL', program_stage_id: null }),
      ],
      'stage-a',
    )
    expect(result.topicBadges).toEqual([])
    expect(result.finalBadge?.badgeName).toBe('Final 1')
  })

  it('field type/stage undefined → fallback: tanpa stage = FINAL, dengan stage = SUBTOPIK', () => {
    const result = splitBadgeSlots(
      [
        // type hilang + ada stage id → diperlakukan SUBTOPIK (cocok stage aktif).
        badge('Tanpa Type', { program_stage_id: 'stage-a' }),
        // type hilang + tanpa stage id → diperlakukan FINAL.
        badge('Tanpa Type Final', { program_stage_id: null }),
      ],
      'stage-a',
    )
    expect(result.topicBadges.map((b) => b.badgeName)).toEqual(['Tanpa Type'])
    expect(result.finalBadge?.badgeName).toBe('Tanpa Type Final')
  })

  it('field type/stage undefined + report legacy → row stage jadi topik, row tanpa stage jadi final', () => {
    const result = splitBadgeSlots(
      [badge('Legacy Topic', { program_stage_id: 'stage-x' }), badge('Legacy Final')],
      undefined,
    )
    expect(result.topicBadges.map((b) => b.badgeName)).toEqual(['Legacy Topic'])
    expect(result.finalBadge?.badgeName).toBe('Legacy Final')
  })

  it('badge_type case-insensitive ("final"/"subtopik") tetap ter-split', () => {
    const result = splitBadgeSlots(
      [
        badge('T', { badge_type: 'subtopik', program_stage_id: 'stage-a' }),
        badge('F', { badge_type: 'final', program_stage_id: null }),
      ],
      'stage-a',
    )
    expect(result.topicBadges.map((b) => b.badgeName)).toEqual(['T'])
    expect(result.finalBadge?.badgeName).toBe('F')
  })

  it('input kosong → { topicBadges: [], finalBadge: undefined }', () => {
    expect(splitBadgeSlots([], 'stage-a')).toEqual({ topicBadges: [], finalBadge: undefined })
    expect(splitBadgeSlots([], '')).toEqual({ topicBadges: [], finalBadge: undefined })
    expect(splitBadgeSlots(undefined, 'stage-a')).toEqual({
      topicBadges: [],
      finalBadge: undefined,
    })
    expect(splitBadgeSlots(null, 'stage-a')).toEqual({ topicBadges: [], finalBadge: undefined })
  })

  it('data utuh: field split TIDAK diubah (identitas objek dipertahankan untuk mapping)', () => {
    const row = badge('Topik A', { badge_type: 'SUBTOPIK', program_stage_id: 'stage-a' })
    const result = splitBadgeSlots([row], 'stage-a')
    expect(result.topicBadges[0]).toBe(row)
  })
})
