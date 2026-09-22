import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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
  it('default ID: select ISO ID dan adornment +62', () => {
    const { container } = render(<Harness />)
    const select = screen.getByLabelText('Kode negara') as HTMLSelectElement
    expect(select.value).toBe('ID')
    expect(container.querySelector('span')?.textContent).toBe('+62')
  })

  it('leading 0 dibuang saat mengetik → memancarkan E.164', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.change(input, { target: { value: '8123456789' } })
    expect(onChange).toHaveBeenLastCalledWith('+628123456789')
  })

  it('ganti negara mempertahankan national number dengan dial code baru', () => {
    const onChange = vi.fn()
    render(<Harness initial="+628123456789" onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Kode negara'), { target: { value: 'US' } })
    expect(onChange).toHaveBeenLastCalledWith('+18123456789')
  })

  it('value E.164 asing → select negara bersesuaian, input national number', () => {
    render(<Harness initial="+12133734253" />)
    expect((screen.getByLabelText('Kode negara') as HTMLSelectElement).value).toBe('US')
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
})
