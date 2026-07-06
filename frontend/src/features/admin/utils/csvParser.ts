export interface ImportRow {
  child_name: string
  child_age: number
  school_name?: string
  parent_name: string
  parent_phone: string
  parent_email?: string
  group_name: string
}

export interface ParseResult {
  valid: ImportRow[]
  errors: { row: number; message: string }[]
}

export function parseCSV(text: string): ParseResult {
  const lines = text.split('\n')
  const valid: ImportRow[] = []
  const errors: { row: number; message: string }[] = []

  if (lines.length < 2) {
    errors.push({ row: 0, message: 'CSV harus memiliki header dan setidaknya satu baris data' })
    return { valid, errors }
  }

  const headers = parseCSVLine(lines[0])
  const headerMap: Record<string, number> = {}
  const requiredColumns = ['child_name', 'child_age', 'parent_name', 'parent_phone']

  for (let i = 0; i < headers.length; i++) {
    headerMap[headers[i].trim().toLowerCase()] = i
  }

  // Check required columns
  for (const col of requiredColumns) {
    if (!(col in headerMap)) {
      errors.push({ row: 0, message: `Kolom wajib "${col}" tidak ditemukan di header CSV` })
    }
  }

  if (errors.length > 0) return { valid, errors }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = parseCSVLine(line)
    const rowNum = i + 1

    if (values.length < requiredColumns.length) {
      errors.push({ row: rowNum, message: `Jumlah kolom (${values.length}) tidak mencukupi. Minimal ${requiredColumns.length} kolom.` })
      continue
    }

    const getValue = (col: string): string => {
      const idx = headerMap[col]
      return idx !== undefined ? (values[idx] || '').trim() : ''
    }

    const child_name = getValue('child_name')
    const child_age_str = getValue('child_age')
    const parent_name = getValue('parent_name')
    const parent_phone = getValue('parent_phone')

    const rowErrors: string[] = []

    if (!child_name) rowErrors.push('Nama anak harus diisi')
    if (!child_age_str && child_age_str !== '0') rowErrors.push('Usia anak harus diisi')
    if (!parent_name) rowErrors.push('Nama orang tua harus diisi')
    if (!parent_phone) rowErrors.push('No. HP orang tua harus diisi')

    const child_age = parseInt(child_age_str, 10)
    if (child_age_str && (isNaN(child_age) || child_age < 0 || child_age > 18)) {
      rowErrors.push('Usia anak harus angka antara 0-18')
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, message: rowErrors.join('; ') })
      continue
    }

    valid.push({
      child_name,
      child_age,
      school_name: getValue('school_name') || undefined,
      parent_name,
      parent_phone,
      parent_email: getValue('parent_email') || undefined,
      group_name: getValue('group_name') || 'Default',
    })
  }

  return { valid, errors }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}
