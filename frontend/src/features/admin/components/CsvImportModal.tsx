import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle2, X, Download } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { Badge } from '../../../shared/components/ui/Badge'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { parseCSV, type ImportRow } from '../utils/csvParser'

interface CsvImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (rows: ImportRow[]) => Promise<void>
}

export function CsvImportModal({ open, onClose, onImport }: CsvImportModalProps) {
  const { addToast } = useGlobalToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([])
  const [parseErrors, setParseErrors] = useState<{ row: number; message: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [importComplete, setImportComplete] = useState(false)
  const [importSummary, setImportSummary] = useState<{ participants: number; groups: number } | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const resetState = useCallback(() => {
    setParsedRows([])
    setParseErrors([])
    setImporting(false)
    setImportComplete(false)
    setImportSummary(null)
    setFileName(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = () => {
    resetState()
    onClose()
  }

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      addToast({ type: 'error', message: 'Hanya file CSV yang didukung' })
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = parseCSV(text)
      setParsedRows(result.valid)
      setParseErrors(result.errors)
    }
    reader.onerror = () => {
      addToast({ type: 'error', message: 'Gagal membaca file' })
    }
    reader.readAsText(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleImport = async () => {
    if (parsedRows.length === 0) return
    setImporting(true)
    try {
      await onImport(parsedRows)
      const groupCount = new Set(parsedRows.map((r) => r.group_name)).size
      setImportSummary({ participants: parsedRows.length, groups: groupCount })
      setImportComplete(true)
      addToast({ type: 'success', message: `${parsedRows.length} peserta berhasil diimpor` })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengimpor data'
      addToast({ type: 'error', message })
    } finally {
      setImporting(false)
    }
  }

  const handleDownloadTemplate = () => {
    const header = 'child_name,child_age,school_name,parent_name,parent_phone,parent_email,group_name'
    const sample = 'Budi Santoso,6,TK A,Andi Santoso,081234567890,andi@mail.com,Kelompok Merah'
    const blob = new Blob([`${header}\n${sample}`], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template-import-peserta.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const uniqueGroups = [...new Set(parsedRows.map((r) => r.group_name))]

  return (
    <Modal open={open} onClose={handleClose} title="Import Peserta dari CSV" size="xl">
      <div className="space-y-5">
        {!importComplete && !fileName && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary bg-primary-container/20'
                  : 'border-outline-variant bg-surface-container-low hover:border-primary hover:bg-primary-container/10'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-on-surface-variant" />
              <p className="text-sm font-medium text-on-surface mb-1">
                Tarik file CSV ke sini atau klik untuk memilih
              </p>
              <p className="text-xs text-on-surface-variant mb-4">
                Format: child_name, child_age, school_name, parent_name, parent_phone, parent_email, group_name
              </p>
              <Button variant="secondary" size="sm" icon={<FileText className="w-4 h-4" />}>
                Pilih File CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <div className="text-center">
              <Button variant="ghost" size="sm" icon={<Download className="w-4 h-4" />} onClick={handleDownloadTemplate}>
                Download Template CSV
              </Button>
            </div>
          </>
        )}

        {fileName && !importComplete && (
          <div className="flex items-center gap-3 px-4 py-3 bg-surface-container-low rounded-xl">
            <FileText className="w-5 h-5 text-primary" />
            <span className="flex-1 text-sm font-medium text-on-surface truncate">{fileName}</span>
            <Button variant="ghost" size="sm" icon={<X className="w-4 h-4" />} tooltip="Hapus file" onClick={resetState} />
          </div>
        )}

        {parseErrors.length > 0 && !importComplete && (
          <div className="bg-error-container/30 rounded-xl p-4">
            <div className="flex items-start gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-on-error-container mt-0.5 shrink-0" />
              <p className="text-sm font-medium text-on-error-container">
                {parseErrors.length} baris memiliki error
              </p>
            </div>
            <ul className="space-y-1 ml-7">
              {parseErrors.slice(0, 10).map((err) => (
                <li key={err.row} className="text-xs text-on-error-container/80">
                  Baris {err.row}: {err.message}
                </li>
              ))}
              {parseErrors.length > 10 && (
                <li className="text-xs text-on-error-container/60">
                  ...dan {parseErrors.length - 10} error lainnya
                </li>
              )}
            </ul>
          </div>
        )}

        {parsedRows.length > 0 && !importComplete && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-on-surface">
                {parsedRows.length} data valid
                {uniqueGroups.length > 0 && (
                  <span className="text-on-surface-variant font-normal">
                    {' '}— {uniqueGroups.length} grup unik: {uniqueGroups.join(', ')}
                  </span>
                )}
              </p>
            </div>

            <div className="border border-outline-variant rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low sticky top-0">
                  <tr>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">Nama Anak</th>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">Usia</th>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">Sekolah</th>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">Orang Tua</th>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">No. HP</th>
                    <th className="text-left font-medium text-on-surface-variant px-3 py-2">Grup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-low/50">
                      <td className="px-3 py-2 text-on-surface">{row.child_name}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{row.child_age}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{row.school_name || '-'}</td>
                      <td className="px-3 py-2 text-on-surface">{row.parent_name}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{row.parent_phone}</td>
                      <td className="px-3 py-2">
                        <Badge variant="primary">{row.group_name}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importComplete && importSummary && (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold text-on-surface mb-1">Import Berhasil!</h3>
            <p className="text-sm text-on-surface-variant">
              {importSummary.participants} peserta berhasil diimpor, {importSummary.groups} grup dibuat.
            </p>
          </div>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-outline-variant">
          <div>
            {fileName && parsedRows.length === 0 && parseErrors.length === 0 && (
              <p className="text-xs text-on-surface-variant">Tidak ada data valid yang ditemukan</p>
            )}
          </div>
          <div className="flex gap-2">
            {importComplete ? (
              <Button onClick={handleClose}>Selesai</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={handleClose} disabled={importing}>
                  Batal
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={parsedRows.length === 0}
                  loading={importing}
                >
                  {importing ? 'Mengimpor...' : `Import ${parsedRows.length} Peserta`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
