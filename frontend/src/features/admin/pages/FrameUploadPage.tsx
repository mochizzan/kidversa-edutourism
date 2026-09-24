import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
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
import { useTranslation } from 'react-i18next'

const FrameUploadPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState<Program[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [programError, setProgramError] = useState<string | null>(null)

  const {
    items, warnings, errorMessage, isSaving, hasEmptyName,
    clearWarnings, clearErrorMessage,
    processFiles, handleRemove, handleUpdateName, handleUpdateProgram,
    handleReplaceImage, handleClearAll, handleSaveAll,
  } = useFrameUploadQueue()

  useEffect(() => {
    programService
      .getAll({ limit: 100 })
      .then((res) => setPrograms(res.data))
      .catch(() => setProgramError(t('admin.frames.programFilterLoadError')))
  }, [])

  const onClearAll = () => {
    handleClearAll()
    setShowClearConfirm(false)
  }

  const programOptions = [
    { value: '', label: t('admin.common.allPrograms') },
    ...programs.map((p) => ({ value: p.id, label: p.name })),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.frames.uploadTitle')}
        breadcrumbs={[{ label: t('admin.frames.pageTitle'), href: ROUTES.ADMIN.FRAMES }, { label: t('admin.frames.uploadTitle') }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate(ROUTES.ADMIN.FRAMES)}>
              {t('common.back')}
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setShowClearConfirm(true)} disabled={items.length === 0}>
              {t('admin.frames.clearAll')}
            </Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={handleSaveAll}
              disabled={items.length === 0 || hasEmptyName} loading={isSaving}>
              {t('admin.frames.saveAll')}
            </Button>
          </div>
        }
      />

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-2xl bg-error-container/20 p-4 text-sm text-error">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={clearErrorMessage} className="font-medium hover:underline">{t('common.close')}</button>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 space-y-0.5">
            {warnings.map((msg, i) => <p key={i}>{msg}</p>)}
          </div>
          <button onClick={clearWarnings} className="shrink-0 font-medium hover:underline">{t('common.close')}</button>
        </div>
      )}

      {programError && (
        <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="flex-1">{programError}</p>
        </div>
      )}

      <FrameDropZone onFilesSelected={processFiles} />

      {items.length === 0 ? (
        <EmptyState icon={<Image className="h-16 w-16" />} title={t('admin.frames.emptyTitle')}
          description={t('admin.frames.emptyDesc')} />
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

      <Modal open={showClearConfirm} onClose={() => setShowClearConfirm(false)} title={t('admin.frames.clearAllTitle')} size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={onClearAll}>{t('admin.frames.clearAll')}</Button>
          </div>
        }>
        <p className="text-sm text-on-surface-variant">{t('admin.frames.clearAllMsg')}</p>
      </Modal>
    </div>
  )
}

export default FrameUploadPage
