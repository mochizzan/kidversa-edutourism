import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, createEvent } from '@testing-library/react'
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
  it('default ID: trigger shows +62 exactly once (no duplicated adornment)', () => {
    render(<Harness />)
    const trigger = screen.getByLabelText('Kode negara')
    expect(trigger.textContent).toContain('+62')
    expect(screen.getAllByText('+62')).toHaveLength(1)
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

  it('empty value: country pick persists on trigger without emitting bare dial', () => {
    const onChange = vi.fn()
    render(<Harness initial="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Kode negara'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'serikat' } })
    const us = screen.getAllByRole('option').find((o) => o.getAttribute('data-iso') === 'US')
    expect(us).toBeTruthy()
    fireEvent.click(us!)
    // No digits typed → value stays '' (never a bare '+1' that would trip validation)…
    expect(onChange).not.toHaveBeenCalledWith('+1')
    // …but the trigger keeps the picked country instead of reverting to +62.
    expect(screen.getByLabelText('Kode negara').textContent).toContain('+1')
  })

  it('empty pick then typing emits E.164 with the picked dial code', () => {
    const onChange = vi.fn()
    render(<Harness initial="" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Kode negara'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'serikat' } })
    const us = screen.getAllByRole('option').find((o) => o.getAttribute('data-iso') === 'US')
    expect(us).toBeTruthy()
    fireEvent.click(us!)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8123456789' } })
    expect(onChange).toHaveBeenLastCalledWith('+18123456789')
  })

  it('mouse click reaches option: mousedown is cancelled so blur cannot unmount first', () => {
    render(<Harness />)
    fireEvent.click(screen.getByLabelText('Kode negara'))
    // Real browsers shift focus on mousedown; on a non-focusable option that
    // blurs the wrapper (relatedTarget null) and unmounts the panel before
    // click fires. Cancelling mousedown preserves the click.
    const first = screen.getAllByRole('option')[0]
    const ev = createEvent.mouseDown(first)
    fireEvent(first, ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
