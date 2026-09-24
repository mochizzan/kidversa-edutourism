import { describe, expect, it } from 'vitest'
import { act, render, screen } from './test-utils'
import { FlagIcon, loadFlagRegistry } from '@/shared/components/ui/FlagIcon'

describe('FlagIcon', () => {
  it('me-render svg statis untuk ISO dengan casing apapun', () => {
    const { container } = render(<FlagIcon iso="id" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('ISO tak dikenal sebelum registry dimuat → render kosong, tanpa throw', () => {
    const { container } = render(<FlagIcon iso="XX" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(container.innerHTML).toBe('')
  })

  it('jalur lazy: null sebelum loadFlagRegistry, svg sesudah registry siap', async () => {
    const { container, rerender } = render(<FlagIcon iso="DE" />)
    expect(container.querySelector('svg')).toBeNull()

    await act(async () => {
      await loadFlagRegistry()
    })

    rerender(<FlagIcon iso="DE" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('title → role="img" dengan accessible name yang sama', () => {
    render(<FlagIcon iso="id" title="Indonesia" />)
    expect(screen.getByRole('img', { name: 'Indonesia' })).toBeTruthy()
  })
})
