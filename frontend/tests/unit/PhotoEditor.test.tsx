import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { PhotoEditor } from '@/features/fasilitator/components/PhotoEditor'
import type { Participant } from '@/core/types'

const participant: Participant = {
  id: 'c-1',
  session_id: 's-1',
  group_id: 'g-1',
  child_name: 'Budi',
  child_age: 7,
  school_name: 'SD Satu',
  parent_name: 'Wali Budi',
  parent_phone: '081234567890',
  consent_photo: true,
  created_at: '2026-09-30T01:00:00Z',
}

type PhotoEditorProps = Parameters<typeof PhotoEditor>[0]

function makeProps(overrides: Partial<PhotoEditorProps> = {}): PhotoEditorProps {
  return {
    participant,
    selectedFrameId: null,
    isReportPhoto: false,
    isSaving: false,
    onOpenFramePicker: vi.fn(),
    onClearFrame: vi.fn(),
    onToggleReportPhoto: vi.fn(),
    onRetake: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  }
}

/** The absolute vertical icon column PhotoEditor anchors in the wrapper gutter, beside the canvas. */
function findIconColumn(container: HTMLElement): HTMLElement {
  const column = Array.from(container.querySelectorAll('div')).find(
    (el) => el.classList.contains('absolute') && el.classList.contains('flex-col'),
  )
  if (!column) throw new Error('icon column not found')
  return column as HTMLElement
}

function click(element: HTMLElement) {
  act(() => {
    fireEvent.click(element)
  })
}

describe('PhotoEditor: post-capture controls with vertical icon column', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders five icon-only controls in an absolute right vertical column with accessible names and no visible text', () => {
    const props = makeProps({ selectedFrameId: 'f-1' })
    const { container } = render(<PhotoEditor {...props} />)

    const column = findIconColumn(container)
    expect(column.classList.contains('absolute')).toBe(true)
    expect(column.classList.contains('flex-col')).toBe(true)
    expect(Array.from(column.classList).some((cls) => cls.startsWith('right-'))).toBe(true)

    const buttons = Array.from(column.querySelectorAll('button'))
    expect(buttons).toHaveLength(5)
    // icon-only: the column carries no visible text labels
    expect(column.textContent).toBe('')
    // every control is a circular icon button
    for (const button of buttons) {
      expect(
        button.classList.contains('rounded-full') &&
        button.classList.contains('w-11') &&
        button.classList.contains('h-11'),
      ).toBe(true)
    }

    // Each control has an accessible name and lives inside the column.
    for (const name of ['Ganti Frame', 'Hapus Frame', 'Jadikan Foto Raport', 'Ulang', 'Simpan']) {
      expect(column.contains(screen.getByRole('button', { name }))).toBe(true)
    }
  })

  it('uses the choose-frame name and hides Hapus Frame when no frame is selected', () => {
    const props = makeProps({ selectedFrameId: null })
    const { container } = render(<PhotoEditor {...props} />)

    expect(screen.getByRole('button', { name: 'Pilih Frame' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hapus Frame' })).toBeNull()
    expect(findIconColumn(container).querySelectorAll('button')).toHaveLength(4)
  })

  it('Batal is a standalone rounded-full capsule centered in a card-less footer and calls onDiscard', () => {
    const props = makeProps()
    const { container } = render(<PhotoEditor {...props} />)

    const batal = screen.getByRole('button', { name: 'Batal' })
    expect(batal.textContent).toBe('Batal')
    expect(batal.classList.contains('rounded-full')).toBe(true)
    expect(findIconColumn(container).contains(batal)).toBe(false)

    // Footer: horizontally centered below the canvas — no card/panel wrapper.
    const footer = batal.parentElement as HTMLElement
    expect(footer.classList.contains('flex-col')).toBe(true)
    expect(footer.classList.contains('items-center')).toBe(true)
    expect(footer.classList.contains('rounded-2xl')).toBe(false)
    expect(footer.classList.contains('border')).toBe(false)
    expect(batal.closest('.rounded-2xl')).toBeNull()

    click(batal)
    expect(props.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('Simpan and Ulang invoke only their own callbacks (no other side effects)', () => {
    const props = makeProps()
    render(<PhotoEditor {...props} />)

    click(screen.getByRole('button', { name: 'Simpan' }))
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onRetake).not.toHaveBeenCalled()
    expect(props.onDiscard).not.toHaveBeenCalled()

    click(screen.getByRole('button', { name: 'Ulang' }))
    expect(props.onRetake).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onDiscard).not.toHaveBeenCalled()
  })

  it('rapor toggle reflects isReportPhoto in aria-pressed and passes the inverted value', () => {
    const onToggleReportPhoto = vi.fn()
    const { rerender } = render(
      <PhotoEditor {...makeProps({ isReportPhoto: false, onToggleReportPhoto })} />,
    )

    const off = screen.getByRole('button', { name: 'Jadikan Foto Raport', pressed: false })
    click(off)
    expect(onToggleReportPhoto).toHaveBeenLastCalledWith(true)

    rerender(<PhotoEditor {...makeProps({ isReportPhoto: true, onToggleReportPhoto })} />)
    const on = screen.getByRole('button', { name: 'Jadikan Foto Raport', pressed: true })
    click(on)
    expect(onToggleReportPhoto).toHaveBeenLastCalledWith(false)
    expect(onToggleReportPhoto).toHaveBeenCalledTimes(2)
  })

  it('while saving every capture control is disabled but Batal stays enabled and works', () => {
    const props = makeProps({ selectedFrameId: 'f-1', isSaving: true })
    render(<PhotoEditor {...props} />)

    expect(screen.getByRole('button', { name: 'Ganti Frame' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Hapus Frame' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Jadikan Foto Raport' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ulang' })).toBeDisabled()

    const simpan = screen.getByRole('button', { name: 'Simpan' })
    expect(simpan).toBeDisabled()
    click(simpan)
    expect(props.onSave).not.toHaveBeenCalled()

    const batal = screen.getByRole('button', { name: 'Batal' })
    expect(batal).not.toBeDisabled()
    click(batal)
    expect(props.onDiscard).toHaveBeenCalledTimes(1)
  })

  it('without photo consent the rapor toggle is disabled and the warning badge survives in the footer', () => {
    const props = makeProps({ participant: { ...participant, consent_photo: false } })
    const { container } = render(<PhotoEditor {...props} />)

    expect(screen.getByRole('button', { name: 'Jadikan Foto Raport' })).toBeDisabled()
    const badge = screen.getByText('Izin foto belum diberikan')
    // Visible in the footer next to the capsule Batal — outside the icon column.
    const batal = screen.getByRole('button', { name: 'Batal' })
    expect(batal.parentElement?.contains(badge)).toBe(true)
    expect(findIconColumn(container).contains(badge)).toBe(false)
  })
})
