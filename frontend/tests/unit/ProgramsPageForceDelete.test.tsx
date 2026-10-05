import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'
import { render, screen } from './test-utils'
import { i18n } from '@/core/i18n'
import { useToastStore } from '@/core/stores/toastStore'
// Real ApiError (backend-client NOT mocked): friendlyError/instanceof checks
// behave exactly like production.
import { ApiError } from '@/core/services/backend-client'

// ── Mocks (registered before importing the page) ──────────────────────────
vi.mock('@/core/services/programs', () => ({
 programService: {
  getAll: vi.fn(),
  getStages: vi.fn(),
  toggleActive: vi.fn(),
  delete: vi.fn(),
 },
}))

vi.mock('@/core/services/sessions', () => ({
 sessionService: { getAll: vi.fn() },
}))

// Import AFTER mocks are registered
import ProgramsPage from '@/features/admin/pages/ProgramsPage'
import { programService } from '@/core/services/programs'
import { sessionService } from '@/core/services/sessions'

const program = {
 id: 'p1',
 name: 'Program Esai',
 description: 'Deskripsi',
 is_active: true,
 created_at: '2026-01-01T00:00:00Z',
}

const affectedSessions = {
 data: [
  { id: 's1', program_id: 'p1', name: 'Sesi Alpha', status: 'ACTIVE', session_date: '2026-10-01', location: 'Ruang 1' },
  { id: 's2', program_id: 'p1', name: 'Sesi Batal', status: 'CANCELLED', session_date: '2026-10-02', location: 'Ruang 2' },
 ],
 total: 2,
 page: 1,
 limit: 2,
 totalPages: 1,
}

const flush = () => act(async () => { })

async function renderPage() {
 render(
  <MemoryRouter>
   <ProgramsPage />
  </MemoryRouter>,
 )
 await flush()
}

/** Icon-only trash is the LAST button in the row's action group (Tooltip
 *  buttons carry no accessible name, mirroring SessionsPage.test). */
function trashButton() {
 const row = screen.getByText('Program Esai').closest('tr') as HTMLTableRowElement
 const buttons = within(row).getAllByRole('button')
 return buttons[buttons.length - 1]
}

describe('ProgramsPage — full force confirmation modal on 409 program_has_sessions (audit #1)', () => {
 beforeEach(() => {
  vi.clearAllMocks()
  useToastStore.setState({ toasts: [] })
  vi.mocked(programService.getAll).mockResolvedValue({
   data: [program],
   total: 1,
   page: 1,
   limit: 1,
   totalPages: 1,
  } as never)
  vi.mocked(programService.delete).mockResolvedValue(undefined as never)
  // First DELETE (tanpa force) → 409 with the program_has_sessions code.
  vi.mocked(programService.delete).mockRejectedValueOnce(
   new ApiError('Program masih memiliki sesi.', 'program_has_sessions', 409),
  )
  vi.mocked(sessionService.getAll).mockResolvedValue(affectedSessions as never)
 })

 it('shows the full modal with count/list/warning/checkbox on 409, then force-calls DELETE', async () => {
  await renderPage()

  // Light confirm opens first.
  act(() => {
   fireEvent.click(trashButton())
  })
  await flush()
  const lightDialog = screen.getByRole('dialog', { name: i18n.t('admin.programs.deleteTitle') })
  expect(within(lightDialog).getByText(i18n.t('admin.programs.deleteMsg'))).toBeInTheDocument()

  // Confirm → DELETE without force → 409 → full modal escalates.
  act(() => {
   fireEvent.click(within(lightDialog).getByRole('button', { name: i18n.t('common.delete') }))
  })
  await flush()

  // First call carried NO force parameter.
  expect(programService.delete).toHaveBeenNthCalledWith(1, 'p1')
  // Session list came from GET /api/sessions?program_id=…
  expect(sessionService.getAll).toHaveBeenCalledWith(
   expect.objectContaining({ filters: { program_id: 'p1' } }),
  )

  const forceDialog = screen.getByRole('dialog', { name: i18n.t('admin.programs.deleteForceTitle') })
  // Count + short list (name + localized status) + hard warning + checkbox.
  expect(within(forceDialog).getByText(i18n.t('admin.programs.deleteForceCount', { count: 2 }))).toBeInTheDocument()
  expect(within(forceDialog).getByText('Sesi Alpha')).toBeInTheDocument()
  expect(within(forceDialog).getByText('Sesi Batal')).toBeInTheDocument()
  expect(within(forceDialog).getByText(i18n.t('admin.status.cancelled'))).toBeInTheDocument()
  expect(within(forceDialog).getByText(i18n.t('admin.programs.deleteForceWarning'))).toBeInTheDocument()

  const confirmBtn = within(forceDialog).getByRole('button', {
   name: i18n.t('admin.programs.deleteForceConfirm'),
  })
  // Checkbox mandatory: button locked until understood.
  expect(confirmBtn).toBeDisabled()
  const checkbox = within(forceDialog).getByRole('checkbox')
  act(() => {
   fireEvent.click(checkbox)
  })
  await flush()
  expect(confirmBtn).toBeEnabled()

  act(() => {
   fireEvent.click(confirmBtn)
  })
  await flush()

  // Second call carried force=true → success → toast + modal closed.
  expect(programService.delete).toHaveBeenNthCalledWith(2, 'p1', { force: true })
  expect(screen.queryByRole('dialog')).toBeNull()
  const toasts = useToastStore.getState().toasts
  expect(
   toasts.some((toast) => toast.message === i18n.t('admin.programs.deletedToast')),
  ).toBe(true)
  // List refreshed after the successful delete.
  expect(vi.mocked(programService.getAll).mock.calls.length).toBeGreaterThanOrEqual(2)
 })

 it('without sessions the light confirm deletes directly (no force modal)', async () => {
  // Resolves on the first (non-force) call — no 409 path.
  vi.mocked(programService.delete).mockReset()
  vi.mocked(programService.delete).mockResolvedValue(undefined as never)

  await renderPage()
  act(() => {
   fireEvent.click(trashButton())
  })
  await flush()
  const lightDialog = screen.getByRole('dialog', { name: i18n.t('admin.programs.deleteTitle') })
  act(() => {
   fireEvent.click(within(lightDialog).getByRole('button', { name: i18n.t('common.delete') }))
  })
  await flush()

  expect(programService.delete).toHaveBeenCalledTimes(1)
  expect(programService.delete).toHaveBeenCalledWith('p1')
  expect(sessionService.getAll).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
 })
})
