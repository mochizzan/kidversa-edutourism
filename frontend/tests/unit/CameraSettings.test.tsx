import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { CameraSettings } from '@/features/fasilitator/components/CameraSettings'

type CameraSettingsProps = Parameters<typeof CameraSettings>[0]

function makeProps(overrides: Partial<CameraSettingsProps> = {}): CameraSettingsProps {
  return {
    disabled: false,
    showGrid: false,
    mirror: false,
    onToggleGrid: vi.fn(),
    onToggleMirror: vi.fn(),
    ...overrides,
  }
}

function click(element: Element) {
  act(() => {
    fireEvent.click(element)
  })
}

describe('CameraSettings: gear and settings panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gear exposes dialog semantics and the panel contains Grid/Mirror switches reflecting state', () => {
    const props = makeProps({ showGrid: true, mirror: false })
    render(<CameraSettings {...props} />)

    const gear = screen.getByRole('button', { name: 'Pengaturan' })
    expect(gear).toHaveAttribute('aria-haspopup', 'dialog')
    expect(gear).toHaveAttribute('aria-expanded', 'false')
    expect(gear).toHaveAttribute('aria-disabled', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()

    click(gear)
    expect(gear).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'Pengaturan' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Cermin' })).toHaveAttribute('aria-checked', 'false')
  })

  it('flipping a switch calls the matching onToggle callback and no other', () => {
    const props = makeProps()
    render(<CameraSettings {...props} />)

    click(screen.getByRole('button', { name: 'Pengaturan' }))
    click(screen.getByRole('switch', { name: 'Grid' }))
    expect(props.onToggleGrid).toHaveBeenCalledTimes(1)
    expect(props.onToggleMirror).not.toHaveBeenCalled()

    click(screen.getByRole('switch', { name: 'Cermin' }))
    expect(props.onToggleMirror).toHaveBeenCalledTimes(1)
    expect(props.onToggleGrid).toHaveBeenCalledTimes(1)
  })

  it('panel closes on outside click and on Escape', () => {
    const props = makeProps()
    render(<CameraSettings {...props} />)

    click(screen.getByRole('button', { name: 'Pengaturan' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Outside click: the fixed backdrop beneath the panel.
    click(document.querySelector('div.fixed.inset-0')!)
    expect(screen.queryByRole('dialog')).toBeNull()

    // Reopen, then Escape.
    click(screen.getByRole('button', { name: 'Pengaturan' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disabled gear shows the reason as tooltip, cannot open the panel, and reports aria-disabled', () => {
    const props = makeProps({ disabled: true })
    render(<CameraSettings {...props} />)

    const gear = screen.getByRole('button', { name: 'Pengaturan' })
    expect(gear).toHaveAttribute('aria-disabled', 'true')

    // Tooltip on hover of the trigger wrapper: why the gear is inert.
    fireEvent.mouseEnter(gear.parentElement as HTMLElement)
    expect(screen.getByText('Kamera belum aktif')).toBeInTheDocument()

    // A click is a guarded no-op — no panel, no crash.
    click(gear)
    expect(gear).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('disabled gear tooltip disappears again when it becomes enabled', () => {
    const { rerender } = render(<CameraSettings {...makeProps({ disabled: true })} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Pengaturan' }).parentElement as HTMLElement)
    expect(screen.getByText('Kamera belum aktif')).toBeInTheDocument()

    rerender(<CameraSettings {...makeProps({ disabled: false })} />)
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Pengaturan' }).parentElement as HTMLElement)
    expect(screen.queryByText('Kamera belum aktif')).toBeNull()
  })
})
