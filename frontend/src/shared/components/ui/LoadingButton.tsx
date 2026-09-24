// LoadingButton — a Button that, while loading, replaces its label with a
// spinner + "Memproses..." (the pattern duplicated in 6+ call sites).
import { Button, type ButtonProps } from './Button'
import { useTranslation } from 'react-i18next'

interface LoadingButtonProps extends Omit<ButtonProps, 'children' | 'loading'> {
  children: React.ReactNode
  loading: boolean
  loadingText?: string
}

export function LoadingButton({
  children,
  loading,
  loadingText,
  disabled,
  ...rest
}: LoadingButtonProps) {
  const { t } = useTranslation()
  return (
    <Button {...rest} loading={loading} disabled={disabled || loading}>
      {loading ? (loadingText ?? t('common.processing')) : children}
    </Button>
  )
}
