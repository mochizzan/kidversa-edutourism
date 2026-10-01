import { describe, it, expect } from 'vitest'
import { generateMiniRaportHTML, type MiniRaportData } from '@/shared/templates/miniRaport'
import { resolveReportPhoto } from '@/features/admin/hooks/useReportReview'
import type { ReportPhotoPick, SmartPhoto } from '@/core/types'

const PHOTO_URL = 'https://cdn.example.com/photos/momen.jpg'

function baseData(overrides: Partial<MiniRaportData> = {}): MiniRaportData {
  return {
    programName: 'KIDVERSA',
    topicName: 'Topik 1',
    childName: 'Budi',
    childAge: 7,
    sessionDate: 'Kamis, 01 Oktober 2026',
    stages: [],
    narrative: 'Budi sangat aktif hari ini.',
    missions: ['Rapikan mainan'],
    badges: [],
    facilitatorName: 'Bu Sari',
    ...overrides,
  }
}

describe('generateMiniRaportHTML — foto rapor vs placeholder', () => {
  it('photoUrl set → renders an <img> with the photo, no placeholder, badge kept', () => {
    const html = generateMiniRaportHTML(baseData({ photoUrl: PHOTO_URL }))
    expect(html).toContain('<img')
    expect(html).toContain(`src="${PHOTO_URL}"`)
    expect(html).not.toContain('PLACEHOLDER FOTO ANAK')
    expect(html).toContain('Momen Terbaik Hari Ini')
  })

  it('photoUrl undefined → placeholder renders, badge kept', () => {
    const html = generateMiniRaportHTML(baseData())
    expect(html).toContain('PLACEHOLDER FOTO ANAK')
    expect(html).not.toContain(`src="${PHOTO_URL}"`)
    expect(html).toContain('Momen Terbaik Hari Ini')
  })
})

describe('resolveReportPhoto — resolusi foto rapor admin (pick → fallback)', () => {
  const participantId = 'p1'
  const topicA = 'stage-a'
  const topicB = 'stage-b'

  const photo = (id: string, isReportPhoto: boolean, owner = participantId): SmartPhoto => ({
    id,
    participant_id: owner,
    session_id: 's1',
    original_file_url: `photos/${id}.jpg`,
    is_report_photo: isReportPhoto,
    taken_by: 'fac-1',
    taken_at: '2026-10-01T00:00:00Z',
  })

  const pick = (programStageId: string, photoId: string): ReportPhotoPick => ({
    program_stage_id: programStageId,
    photo_id: photoId,
  })

  it('pick with a live photo wins over the is_report_photo default', () => {
    const photos = [photo('default', true), photo('picked', false)]
    const picks = [pick(topicA, 'picked')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('picked')
  })

  it('pick whose photo was deleted falls back to the is_report_photo photo', () => {
    const photos = [photo('default', true)] // pick's photo is gone
    const picks = [pick(topicA, 'deleted')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)?.id).toBe('default')
  })

  it('pick with deleted photo and no flagged default → null (photoUrl undefined)', () => {
    const photos = [photo('plain', false, 'other')]
    const picks = [pick(topicA, 'deleted')]
    expect(resolveReportPhoto(picks, photos, participantId, topicA)).toBe(null)
  })

  it('no pick for active topic, or picks not loaded → is_report_photo fallback', () => {
    const photos = [photo('default', true)]
    expect(resolveReportPhoto([pick(topicB, 'x')], photos, participantId, topicA)?.id).toBe(
      'default',
    )
    expect(resolveReportPhoto(null, photos, participantId, topicA)?.id).toBe('default')
  })

  it('nothing flagged → null (buildRaportHtml maps null to an undefined photoUrl)', () => {
    expect(resolveReportPhoto(null, [], participantId, topicA)).toBe(null)
    expect(resolveReportPhoto(null, [photo('plain', false)], participantId, null)).toBe(null)
  })
})
