import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { render, screen } from './test-utils'
import { AvatarUploadModal } from '@/shared/components/ui/AvatarUploadModal'

// jsdom implements neither createObjectURL nor revokeObjectURL.
const mockCreateObjectURL = vi.fn(() => 'blob:mock-avatar-preview')
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]')
  if (!input) throw new Error('file input not found')
  return input as HTMLInputElement
}

describe('AvatarUploadModal file validation feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', {
      value: mockCreateObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      configurable: true,
      writable: true,
    })
  })

  it('surfaces the rejection reason for a non-image file instead of dropping it silently', () => {
    const onUpload = vi.fn()
    render(<AvatarUploadModal open onClose={vi.fn()} onUpload={onUpload} />)

    const file = new File(['bukan gambar'], 'catatan.txt', { type: 'text/plain' })
    fireEvent.change(fileInput(), { target: { files: [file] } })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('File harus berupa gambar')
    // Rejected file is not selected: no save action, no preview, no upload.
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
    expect(mockCreateObjectURL).not.toHaveBeenCalled()
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('surfaces the size limit for an oversized image', () => {
    render(<AvatarUploadModal open onClose={vi.fn()} onUpload={vi.fn()} />)

    const big = new File([new ArrayBuffer(6 * 1024 * 1024)], 'gede.png', { type: 'image/png' })
    fireEvent.change(fileInput(), { target: { files: [big] } })

    expect(screen.getByRole('alert')).toHaveTextContent('Ukuran file maksimal 5MB')
    expect(screen.queryByRole('button', { name: 'Simpan' })).toBeNull()
  })

  it('accepts a valid image without showing any error', () => {
    render(<AvatarUploadModal open onClose={vi.fn()} onUpload={vi.fn()} />)

    const file = new File(['gambar'], 'foto.png', { type: 'image/png' })
    fireEvent.change(fileInput(), { target: { files: [file] } })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(mockCreateObjectURL).toHaveBeenCalledWith(file)
    // A selected file enables the save action.
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeInTheDocument()
  })
})
