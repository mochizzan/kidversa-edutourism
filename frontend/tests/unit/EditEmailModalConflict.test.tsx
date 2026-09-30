import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { act, render, screen } from './test-utils'

vi.mock('@/core/services/users', () => ({
  userService: {
    update: vi.fn(),
    getAll: vi.fn(),
  },
}))

// Import after mocks are registered
import EditEmailModal from '@/features/fasilitator/components/EditEmailModal'
import { userService } from '@/core/services/users'
import { ApiError } from '@/core/services/backend-client'
import { useToastStore } from '@/core/stores/toastStore'
import type { User } from '@/core/types'

const user = {
  id: 'user-1',
  email: 'lama@kidversa.test',
  password_hash: 'hash',
  role: 'FASILITATOR',
  name: 'Fasilitator Satu',
  is_active: true,
  approval_status: 'approved',
  created_at: '2026-01-01T00:00:00Z',
} as User

const errorToasts = () =>
  useToastStore.getState().toasts.filter((t) => t.type === 'error')

async function submitEmail(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
  })
}

describe('EditEmailModal server-authoritative duplicate handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useToastStore.setState({ toasts: [] })
    // The old admin-list pre-check used getAll — it must never come back
    // (admin-only endpoint: 403 for fasilitator, and racy anyway).
    vi.mocked(userService.getAll).mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 1 } as never)
  })

  it('shows the email-exists copy when the server answers 409 conflict', async () => {
    const onClose = vi.fn()
    vi.mocked(userService.update).mockRejectedValue(
      new ApiError('Data sudah ada atau bentrok', 'conflict', 409),
    )

    render(<EditEmailModal open onClose={onClose} user={user} />)
    await submitEmail('baru@kidversa.test')

    expect(userService.update).toHaveBeenCalledWith('user-1', { email: 'baru@kidversa.test' })
    expect(userService.getAll).not.toHaveBeenCalled()
    const errors = errorToasts()
    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('Email sudah digunakan oleh akun lain')
    // Failure keeps the modal open for correction.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the no-permission copy when the server answers 403 forbidden', async () => {
    const onClose = vi.fn()
    vi.mocked(userService.update).mockRejectedValue(
      new ApiError('Akses ditolak', 'forbidden', 403),
    )

    render(<EditEmailModal open onClose={onClose} user={user} />)
    await submitEmail('baru@kidversa.test')

    const errors = errorToasts()
    expect(errors.length).toBe(1)
    expect(errors[0].message).toBe('Anda tidak memiliki izin untuk mengubah data ini.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves and closes on success without any duplicate pre-check', async () => {
    const onClose = vi.fn()
    vi.mocked(userService.update).mockResolvedValue({
      ...user,
      email: 'baru@kidversa.test',
    } as never)

    render(<EditEmailModal open onClose={onClose} user={user} />)
    await submitEmail('Baru@Kidversa.test')

    expect(userService.getAll).not.toHaveBeenCalled()
    expect(userService.update).toHaveBeenCalledWith('user-1', { email: 'baru@kidversa.test' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(errorToasts()).toHaveLength(0)
  })
})
