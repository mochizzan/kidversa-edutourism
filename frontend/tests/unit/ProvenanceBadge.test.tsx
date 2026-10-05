import { describe, it, expect } from 'vitest'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'

import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge'
import { ReportAssessmentScores } from '@/features/admin/components/ReportAssessmentScores'
import type { StageInfo } from '@/features/admin/hooks/useReportReview'

describe('ProvenanceBadge — clone label shown only for non-null source_session_id (label provenance)', () => {
  it('report form: full line with source name + translated source status', () => {
    render(
      <ProvenanceBadge
        sourceSessionId="s-src"
        sourceSessionName="Sesi Lama"
        sourceSessionStatus="CANCELLED"
      />,
    )
    expect(
      screen.getByText(
        i18n.t('common.provenance.withNameStatus', {
          name: 'Sesi Lama',
          status: i18n.t('admin.status.cancelled'),
        }),
      ),
    ).toBeInTheDocument()
  })

  it('generic form when the snapshot name is missing (assessments carry id only)', () => {
    render(<ProvenanceBadge sourceSessionId="s-src" />)
    expect(screen.getByText(i18n.t('common.provenance.generic'))).toBeInTheDocument()
  })

  it('renders NOTHING for natively created data (source_session_id null)', () => {
    const { container } = render(
      <ProvenanceBadge sourceSessionId={null} sourceSessionName="Sesi Lama" sourceSessionStatus="ACTIVE" />,
    )
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText(i18n.t('common.provenance.generic'))).toBeNull()
  })
})

describe('ReportAssessmentScores — per-row provenance badge in the assessment detail list', () => {
  const stageInfos: StageInfo[] = [
    {
      programStage: { id: 'ps1', name: 'Topik Satu' },
      sessionStageId: 'ss1',
      kegiatan: [
        {
          programSubstageName: 'Kegiatan A',
          assessment: {
            id: 'a1',
            participant_id: 'c-1',
            session_id: 's-1',
            session_substage_id: 'sub1',
            star_rating: 3,
            comment: 'Mantap',
            assessed_by: 'u1',
            assessed_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-01T00:00:00Z',
            source_session_id: 's-src',
          },
        },
        {
          programSubstageName: 'Kegiatan B',
          assessment: {
            id: 'a2',
            participant_id: 'c-1',
            session_id: 's-1',
            session_substage_id: 'sub2',
            star_rating: 2,
            assessed_by: 'u1',
            assessed_at: '2026-10-01T00:00:00Z',
            updated_at: '2026-10-01T00:00:00Z',
            source_session_id: null,
          },
        },
      ],
    },
  ] as never as StageInfo[]

  it('shows the badge exactly on the cloned row — not on the native one', () => {
    render(<ReportAssessmentScores stageInfos={stageInfos} />)
    expect(screen.getAllByText(i18n.t('common.provenance.generic'))).toHaveLength(1)
    expect(screen.getByText('Kegiatan A')).toBeInTheDocument()
    expect(screen.getByText('Kegiatan B')).toBeInTheDocument()
  })
})
