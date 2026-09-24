import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { act, render, screen } from '../test-utils'
import { LanguageSwitcherModal } from '../../../src/shared/components/ui/LanguageSwitcherModal'
import { i18n } from '../../../src/core/i18n'

describe('LanguageSwitcherModal', () => {
  afterEach(async () => {
    await i18n.changeLanguage('id')
  })

  it('lists all 9 languages, filters, shows the empty state, and switches via the ms row', async () => {
    const onClose = vi.fn()
    render(<LanguageSwitcherModal open onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Pilih Bahasa' })).toBeTruthy()
    expect(document.querySelector('[data-lang-code="id"]')?.getAttribute('aria-current')).toBe('true')

    const rows = () => document.querySelectorAll('[data-lang-code]')
    expect(rows().length).toBe(9)
    for (const row of rows()) expect(row.querySelector('svg')).toBeTruthy()
    expect(document.body.textContent?.match(/[\u{1F1E6}-\u{1F1FF}]/u) ?? null).toBeNull()

    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Malay' } })
    expect(rows().length).toBe(1)
    expect(rows()[0]?.getAttribute('data-lang-code')).toBe('ms')

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(rows().length).toBe(0)
    expect(screen.getByText('Bahasa tidak ditemukan')).toBeTruthy()

    fireEvent.change(search, { target: { value: '' } })
    expect(rows().length).toBe(9)

    const switched = new Promise<unknown>((resolve) => i18n.once('languageChanged', resolve))
    let switchedTo: unknown
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Bahasa Melayu/ }))
      switchedTo = await switched
    })
    expect(switchedTo).toBe('ms')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
