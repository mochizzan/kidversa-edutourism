import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render, screen } from './test-utils'

// Mock lucide icons as no-op components
vi.mock('lucide-react', () => ({
  RefreshCw: function MockRefreshCw() {
    return null
  },
  Trash2: function MockTrash2() {
    return null
  },
}))

// Import after mock is registered
import { FrameUploadCard } from '@/features/admin/components/FrameUploadCard'

interface ProgramOption {
  value: string
  label: string
}

const programOptions: ProgramOption[] = [
  { value: '', label: 'Pilih Program' },
  { value: 'prog-1', label: 'Program 1' },
  { value: 'prog-2', label: 'Program 2' },
]

describe('FrameUploadCard', () => {
  const onUpdateName = vi.fn()
  const onUpdateProgram = vi.fn()
  const onReplaceImage = vi.fn()
  const onRemove = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the preview image with correct src and alt', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const img = screen.getByAltText('Test Frame') as HTMLImageElement
    expect(img).toBeInTheDocument()
    expect(img.src).toBe('https://example.com/preview.png')
  })

  it('renders the name input with the current value', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const input = screen.getByLabelText('Nama Frame') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('Test Frame')
  })

  it('renders the program select with options', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const select = screen.getByLabelText('Program') as HTMLSelectElement
    expect(select).toBeInTheDocument()
    expect(select.options).toHaveLength(3)
    expect(select.value).toBe('')
  })

  it('renders both action buttons with correct labels', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    expect(screen.getByText('Ganti Gambar')).toBeInTheDocument()
    expect(screen.getByText('Hapus')).toBeInTheDocument()
  })

  it('calls onUpdateName when the name input changes', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const input = screen.getByLabelText('Nama Frame') as HTMLInputElement
    act(() => {
      // React 19's value tracker requires the native value setter to be called
      // before dispatching the input event, otherwise the onChange handler is not triggered
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, 'Updated Frame')
      }
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }))
    })

    expect(onUpdateName).toHaveBeenCalledTimes(1)
    expect(onUpdateName).toHaveBeenCalledWith('item-1', 'Updated Frame')
  })

  it('calls onUpdateProgram when the program select changes', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const select = screen.getByLabelText('Program') as HTMLSelectElement
    act(() => {
      select.value = 'prog-2'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onUpdateProgram).toHaveBeenCalledTimes(1)
    expect(onUpdateProgram).toHaveBeenCalledWith('item-1', 'prog-2')
  })

  it('calls onReplaceImage when the "Ganti Gambar" button is clicked', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const button = screen.getByText('Ganti Gambar')
    act(() => {
      button.click()
    })

    expect(onReplaceImage).toHaveBeenCalledTimes(1)
    expect(onReplaceImage).toHaveBeenCalledWith('item-1')
  })

  it('calls onRemove when the "Hapus" button is clicked', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId=""
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const button = screen.getByText('Hapus')
    act(() => {
      button.click()
    })

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith('item-1')
  })

  it('reflects the selected program in the select element', () => {
    render(
      <FrameUploadCard
        id="item-1"
        preview="https://example.com/preview.png"
        name="Test Frame"
        programId="prog-1"
        programOptions={programOptions}
        onUpdateName={onUpdateName}
        onUpdateProgram={onUpdateProgram}
        onReplaceImage={onReplaceImage}
        onRemove={onRemove}
      />,
    )

    const select = screen.getByLabelText('Program') as HTMLSelectElement
    expect(select.value).toBe('prog-1')
  })
})
