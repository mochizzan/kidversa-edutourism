import { ToggleLeft, ToggleRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

export interface StatusToggleProps {
  isActive: boolean
  onClick: () => void
  disabled?: boolean
}

export function StatusToggle({ isActive, onClick, disabled }: StatusToggleProps) {
  const { t } = useTranslation()

  return (
    <Button
      variant="ghost"
      size="sm"
      icon={isActive ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
      tooltip={isActive ? t('admin.common.deactivate') : t('admin.common.activate')}
      onClick={onClick}
      disabled={disabled}
    />
  )
}
