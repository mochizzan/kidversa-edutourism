import { useState } from 'react'
import { SkipForward, ArrowRight, RotateCcw, AlertTriangle } from 'lucide-react'
import { Modal } from '../../../shared/components/ui/Modal'
import { Button } from '../../../shared/components/ui/Button'
import { Select } from '../../../shared/components/ui/Select'
import { cn } from '../../../core/utils'

interface StageOption {
  value: string
  label: string
}

interface ConfirmOverrideModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (reason: string, targetStageId?: string) => void
  actionType: 'skip' | 'jump' | 'reset'
  availableStages?: StageOption[]
}

const actionConfig: Record<
  string,
  { title: string; description: string; icon: React.ReactNode; color: string }
> = {
  skip: {
    title: 'Skip Stage',
    description: 'Lewati stage saat ini untuk grup ini. Stage akan ditandai sebagai SKIPPED.',
    icon: <SkipForward className="w-5 h-5" />,
    color: 'text-amber-600 bg-amber-100',
  },
  jump: {
    title: 'Jump ke Stage',
    description: 'Lompat ke stage tertentu. Semua progress grup akan direset.',
    icon: <ArrowRight className="w-5 h-5" />,
    color: 'text-orange-600 bg-orange-100',
  },
  reset: {
    title: 'Reset Progress',
    description: 'Reset semua progress grup ke awal. Semua data progress akan dihapus.',
    icon: <RotateCcw className="w-5 h-5" />,
    color: 'text-red-600 bg-red-100',
  },
}

export function ConfirmOverrideModal({
  open,
  onClose,
  onConfirm,
  actionType,
  availableStages = [],
}: ConfirmOverrideModalProps) {
  const [reason, setReason] = useState('')
  const [targetStageId, setTargetStageId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const config = actionConfig[actionType]

  const handleConfirm = async () => {
    // Validate: reason is required
    if (!reason.trim()) {
      setError('Alasan wajib diisi')
      return
    }
    // Validate: target stage required for jump
    if (actionType === 'jump' && !targetStageId) {
      setError('Pilih stage tujuan')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(reason.trim(), actionType === 'jump' ? targetStageId : undefined)
      // Reset form
      setReason('')
      setTargetStageId('')
      setError('')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setReason('')
    setTargetStageId('')
    setError('')
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={config.title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant={actionType === 'reset' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={submitting}
          >
            Konfirmasi
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Action type indicator */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low">
          <div className={cn('p-2 rounded-lg', config.color)}>
            {config.icon}
          </div>
          <div>
            <p className="text-sm font-medium text-on-surface">{config.title}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{config.description}</p>
          </div>
        </div>

        {/* Target stage selector (jump only) */}
        {actionType === 'jump' && (
          <Select
            label="Stage Tujuan"
            placeholder="Pilih stage..."
            options={availableStages}
            value={targetStageId}
            onChange={(e) => {
              setTargetStageId(e.target.value)
              setError('')
            }}
          />
        )}

        {/* Override reason textarea */}
        <div>
          <label
            htmlFor="override-reason"
            className="block text-sm font-medium text-on-surface mb-1"
          >
            Alasan <span className="text-error">*</span>
          </label>
          <textarea
            id="override-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            placeholder="Jelaskan alasan override..."
            rows={3}
            className={cn(
              'w-full rounded-xl border border-outline-variant bg-surface px-3 py-2 text-sm resize-none',
              'focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none',
              error && 'border-error focus:border-error focus:ring-error-container'
            )}
          />
          {error && (
            <p className="mt-1 text-xs text-error flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        {actionType === 'reset' && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Tindakan ini akan menghapus semua progress stage untuk grup ini dan
              mengembalikannya ke stage pertama. Tidak dapat dibatalkan.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
