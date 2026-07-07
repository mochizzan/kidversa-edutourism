import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Image, Trash2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { programService } from '../../../core/services/programs'
import type { Program } from '../../../core/types'
import { useFrameUploadQueue } from '../hooks/useFrameUploadQueue'
import { FrameDropZone } from '../components/FrameDropZone'
import { FrameUploadCard } from '../components/FrameUploadCard'

const FrameUploadPage = () => {
  const navigate = useNavigate()
  const [programs, setPrograms] = useState<Program[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const {
    items, warnings, errorMessage, isSaving, hasEmptyName,
    clearWarnings, clearErrorMessage,
    processFiles, handleRemove, handleUpdateName, handleUpdateProgram,
    handleReplaceImage, handleClearAll, handleSaveAll,
  } = useFrameUploadQueue()

  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data)).catch(() => {})
  }, [])

  const onClearAll = () => {
    handleClearAll()
    setShowClearConfirm(false)
  }

  const programOptions = [
    { value: '', label: 'Semua Program' },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Frame"
        breadcrumbs={[{ label: 'Frames', href: '/admin/frames' }, { label: 'Upload Frame' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate('/admin/frames')}>
              Kembali
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setShowClearConfirm(true)} disabled={items.length === 0}>
              Hapus Semua
            </Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={handleSaveAll}
              disabled={items.length === 0 || hasEmptyName} loading={isSaving}>
              Simpan Semua
            </Button>
          </div>
        }
      />

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-error-container/20 p-4 text-sm text-error">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={clearErrorMessage} className="font-medium hover:underline">Tutup</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            {warnings.map((msg, i) => <p key={i}>{msg}</p>)}
          </div>
          <button onClick={clearWarnings} className="shrink-0 font-medium hover:underline">Tutup</button>
        </div>
      )}

      <FrameDropZone onFilesSelected={processFiles} />

      {items.length === 0 ? (
        <EmptyState icon={<Image className="h-16 w-16" />} title="Belum ada frame"
          description="Seret dan lepas gambar di atas untuk memulai upload." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <FrameUploadCard
              key={item.id}
              id={item.id} preview={item.preview} name={item.name} programId={item.programId}
              programOptions={programOptions}
              onUpdateName={handleUpdateName} onUpdateProgram={handleUpdateProgram}
              onReplaceImage={handleReplaceImage} onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title="Hapus Semua Frame" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>Batal</Button>
            <Button variant="danger" onClick={onClearAll}>Hapus Semua</Button>
          </div>
        }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus semua frame dari antrean?</p>
      </Modal>
    </div>
  )
}

export default FrameUploadPage
