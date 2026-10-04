import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from './test-utils'
import type { ReactNode } from 'react'
import type { PublicReport } from '@/core/types'

// ── Harness (registered before the page import) ──────────────────────────
// The token guard fetches over the network; inject the payload under test
// straight through so the REAL ReportView badge path (splitBadgeSlots →
// generateMiniRaportHTML) runs unmodified.
vi.mock('@/shared/components/auth/ParentTokenGuard', () => ({
  ParentTokenGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
  useParentToken: vi.fn(),
}))

// The zoom/pan wrapper needs ResizeObserver (absent in jsdom) and is not the
// subject under test — render its children verbatim.
vi.mock('@/shared/components/feedback/RaportZoomPan', () => ({
  RaportZoomPan: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { useParentToken } from '@/shared/components/auth/ParentTokenGuard'
import ReportPage from '@/features/parent/pages/ReportPage'

const useParentTokenMock = vi.mocked(useParentToken)

/** Token parent yang disuntikkan renderReport — dipakai juga untuk memastikan src badge ber-?token=. */
const TOKEN = 'tok-1'

/** Baseline report; badge fields supplied per test to model legacy payloads. */
function report(overrides: Record<string, unknown> = {}): PublicReport {
  return {
    id: 'r1',
    participant_id: 'p1',
    session_id: 's1',
    status: 'APPROVED',
    program_name: 'Petualangan Sains',
    topic_name: 'Topik A',
    child_name: 'Budi Santoso',
    ...overrides,
  } as PublicReport
}

/** Renders the page with the payload and flushes the async HTML build. */
async function renderReport(payload: unknown): Promise<HTMLElement> {
  useParentTokenMock.mockReturnValue({
    token: TOKEN,
    report: payload as PublicReport,
    participant: null,
    loading: false,
    error: null,
  })
  const { container } = render(<ReportPage />)
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, 0)
  await act(async () => {
    await promise
  })
  return container
}

/** The built mini-raport markup (null when the page fell back to error UI). */
function builtHtml(container: HTMLElement): string | null {
  const iframe = container.querySelector('iframe')
  return iframe ? iframe.getAttribute('srcdoc') ?? '' : null
}

describe('ReportPage — badge slots mengikuti payload rapor (kontrak Fase 2 D5)', () => {
  beforeEach(() => {
    useParentTokenMock.mockReset()
  })

  it('D5-3 payload LAMA tanpa field badge baru (badges/badge_type/program_stage_id hilang) → render aman', async () => {
    const container = await renderReport(report())
    const html = builtHtml(container)
    expect(html).not.toBeNull() // halaman tidak jatuh ke error state
    expect(html).toContain('Belum ada badge yang diraih.')
    expect(html).not.toContain('data-badge-slot=')
  })

  it('D5-3 badges: null (bukan []) → tetap aman, empty-state', async () => {
    const container = await renderReport(report({ badges: null }))
    const html = builtHtml(container)
    expect(html).not.toBeNull()
    expect(html).toContain('Belum ada badge yang diraih.')
  })

  it('D5-3 badge lama tanpa badge_type/program_stage_id → split fallback tetap memilih slot', async () => {
    // Row legacy: punya stage id tapi tanpa type → diperlakukan topik;
    // row tanpa stage id dan tanpa type → diperlakukan FINAL.
    // Catatan: isi section kini hanya <img> (tanpa ikon/nama) — badge_image_url
    // disertakan agar pemilihan slot split tetap teramati lewat gambar.
    const container = await renderReport(
      report({
        program_stage_id: 'stage-a',
        badges: [
          { badge_name: 'Badge Topik A', badge_image_url: 'badge-topik-a.png', program_stage_id: 'stage-a' },
          { badge_name: 'Badge Final', badge_image_url: 'badge-final.png' },
        ],
      }),
    )
    const html = builtHtml(container)
    expect(html).not.toBeNull()
    expect(html).toContain('data-badge-slot="topik">')
    expect(html).toContain('data-badge-slot="final">')
    expect(html).toContain('Badge Topik A')
    expect(html).toContain('Badge Final')
    // Section menampilkan gambar badge saja, maksimal 2 (topik pertama + final).
    const badgeImgs = (html ?? '').match(/<img[^>]*src="[^"]*badge-[^"]*"/g) ?? []
    expect(badgeImgs.length).toBeLessThanOrEqual(2)
    // Kontrak badge_image_url: path badge + ?token= sesuai token mock (tanpa itu img 404 → capture gagal).
    expect(html).toContain(`src="badge-topik-a.png?token=${TOKEN}"`)
    expect(html).toContain(`src="badge-final.png?token=${TOKEN}"`)
    expect(html).not.toContain('Belum ada badge yang diraih.')
  })

  it('D5-1 program tanpa badge final (hanya badge topik TOPIK di rapor ini) → slot kanan kosong, tanpa crash', async () => {
    const container = await renderReport(
      report({
        program_stage_id: 'stage-a',
        badges: [
          {
            badge_name: 'Badge Topik A',
            badge_image_url: 'badge-topik-a.png',
            badge_type: 'TOPIK',
            program_stage_id: 'stage-a',
          },
        ],
      }),
    )
    const html = builtHtml(container)
    expect(html).not.toBeNull()
    expect(html).toContain('Badge Topik A')
    // Slot kiri berisi <img> dengan src ber-?token= (kontrak badge_image_url).
    expect(html).toContain(`src="badge-topik-a.png?token=${TOKEN}"`)
    expect(html).toMatch(/data-badge-slot="final">\s*<\/div>/)
    expect(html).not.toContain('Belum ada badge yang diraih.')
  })

  it('D5-2 topik tanpa badge (hanya badge FINAL) → slot kiri kosong, tanpa crash', async () => {
    const container = await renderReport(
      report({
        program_stage_id: 'stage-a',
        badges: [
          {
            badge_name: 'Badge Final Program',
            badge_image_url: 'badge-final-program.png',
            badge_type: 'FINAL',
            program_stage_id: null,
          },
        ],
      }),
    )
    const html = builtHtml(container)
    expect(html).not.toBeNull()
    expect(html).toContain('Badge Final Program')
    // Slot kanan berisi <img> dengan src ber-?token= (kontrak badge_image_url).
    expect(html).toContain(`src="badge-final-program.png?token=${TOKEN}"`)
    expect(html).toMatch(/data-badge-slot="topik">\s*<\/div>/)
    expect(html).not.toContain('Belum ada badge yang diraih.')
  })
})
