import { describe, it, expect, vi } from 'vitest'
import { render, screen } from './test-utils'
import { FramePicker } from '@/features/fasilitator/components/FramePicker'
import type { PhotoFrame } from '@/core/types'

const makeFrame = (overrides: Partial<PhotoFrame> & { id: string }): PhotoFrame => ({
  tenant_id: 'tenant-1',
  name: `Frame ${overrides.id}`,
  file_url: `/api/media/frame/${overrides.id}`,
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const globalFrame = makeFrame({ id: 'global', program_id: '', name: 'Frame Global' })
const ownFrame = makeFrame({ id: 'own', program_id: 'prog-1', name: 'Frame Own' })
const otherFrame = makeFrame({ id: 'other', program_id: 'prog-2', name: 'Frame Other' })
const inactiveFrame = makeFrame({
  id: 'inactive',
  program_id: 'prog-1',
  name: 'Frame Inactive',
  is_active: false,
})

describe('FramePicker ownership-aware filtering', () => {
  it('renders only global and own-program active frames for the given programId', () => {
    const { container } = render(
      <FramePicker
        frames={[globalFrame, ownFrame, otherFrame, inactiveFrame]}
        programId="prog-1"
        selectedFrameId={null}
        onSelect={vi.fn()}
      />,
    )

    // The "Tanpa Frame" first cell is preserved.
    expect(screen.getByText('Tanpa Frame')).toBeInTheDocument()

    expect(screen.getByAltText('Frame Global')).toBeInTheDocument()
    expect(screen.getByAltText('Frame Own')).toBeInTheDocument()

    // A frame owned by ANOTHER program must never appear.
    expect(screen.queryByAltText('Frame Other')).toBeNull()
    expect(container.textContent).not.toContain('Frame Other')
    // Inactive frames are dropped too.
    expect(screen.queryByAltText('Frame Inactive')).toBeNull()
    expect(container.textContent).not.toContain('Frame Inactive')
  })

  it('shows an empty state (plus Tanpa Frame) when no frame belongs to the program', () => {
    render(
      <FramePicker
        frames={[otherFrame]}
        programId="prog-1"
        selectedFrameId={null}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Tanpa Frame')).toBeInTheDocument()
    expect(
      screen.getByText('Tidak ada frame yang tersedia untuk program ini'),
    ).toBeInTheDocument()
    expect(screen.queryByAltText('Frame Other')).toBeNull()
  })
})
