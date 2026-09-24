import { Button } from '../../../shared/components/ui/Button'
import { useTranslation } from 'react-i18next'

interface ProgramCreateFormProps {
  newName: string
  setNewName: (v: string) => void
  newDesc: string
  setNewDesc: (v: string) => void
  creating: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function ProgramCreateForm({ newName, setNewName, newDesc, setNewDesc, creating, onCancel, onSubmit }: ProgramCreateFormProps) {
  const { t } = useTranslation()
  return (
    <form className="space-y-4 max-w-2xl" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">{t('admin.programs.createNameLabel')}</label>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          placeholder={t('admin.programs.namePlaceholder')} required disabled={creating} />
      </div>
      <div>
        <label className="block text-sm font-medium text-on-surface mb-1">{t('admin.programs.descLabel')}</label>
        <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
          className="w-full rounded-xl border border-outline-variant px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
          rows={4} placeholder={t('admin.programs.descPlaceholder')} disabled={creating} />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={creating}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={creating || !newName.trim()}>{creating ? t('admin.programs.createSaving') : t('admin.programs.saveBtn')}</Button>
      </div>
    </form>
  )
}
