import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhoneInput } from '@/shared/components/ui/PhoneInput'

function Harness({
  initial = '',
  onChange,
}: {
  initial?: string
  onChange?: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <PhoneInput
      id="parent_phone"
      label="No. HP Orang Tua"
      required
      value={value}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
    />
  )
}

describe('PhoneInput', () => {
  it('default ID: trigger ISO ID dan adornment +62', () => {
    const { container } = render(<Harness />)
    const trigger = screen.getByLabelText('Kode negara')
    expect(trigger.textContent).toContain('+62')
    expect((container.querySelector('input')!.previousElementSibling as HTMLElement).textContent).toBe('+62')
  })

  it('leading 0 dibuang saat mengetik → memancarkan E.164', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.change(input, { target: { value: '8123456789' } })
    expect(onChange).toHaveBeenLastCalledWith('+628123456789')
  })

  it('ganti negara mempertahankan national number dengan dial code baru', async () => {
    const onChange = vi.fn()
    render(<Harness initial="+628123456789" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Kode negara'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'serikat' } })
    // 'serikat' cocok dgn dua entri CLDR (US & Kepulauan Virgin Amerika Serikat) — identifikasi op US unik via data-iso.
    const us = screen.getAllByRole('option').find((o) => o.getAttribute('data-iso') === 'US')
    expect(us).toBeTruthy()
    expect(us!.textContent).toMatch(/Amerika Serikat/)
    // Bukti jalur lazy: op US berisi <svg> setelah loadFlagRegistry() resolve.
    await waitFor(() => expect(us!.querySelector('svg')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(us!)
    expect(onChange).toHaveBeenLastCalledWith('+18123456789')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('value E.164 asing → trigger negara bersesuaian, input national number', () => {
    render(<Harness initial="+12133734253" />)
    expect(screen.getByLabelText('Kode negara').textContent).toContain('+1')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('2133734253')
  })

  it('error tampil sebagai role=alert; hint tampil bila tanpa error', () => {
    const { rerender } = render(
      <PhoneInput id="p" value="" onChange={() => { }} error="Wajib diisi" hint="Petunjuk" />
    )
    expect(screen.getByRole('alert').textContent).toBe('Wajib diisi')

    rerender(<PhoneInput id="p" value="" onChange={() => { }} hint="Petunjuk" />)
    expect(screen.getByText('Petunjuk')).toBeTruthy()
  })

  it('empty state: pencarian tanpa hasil → menampilkan Negara tidak ditemukan', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Kode negara'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('Negara tidak ditemukan')).toBeTruthy()
  })

  it('Escape menutup panel dan fokus kembali ke trigger', () => {
    render(<Harness />)
    const trigger = screen.getByLabelText('Kode negara')
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
