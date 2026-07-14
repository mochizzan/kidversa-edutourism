// LoadingButton — a Button that, while loading, replaces its label with a
// spinner + "Memproses..." (the pattern duplicated in 6+ call sites).
import { Button, type ButtonProps } from './Button'

interface LoadingButtonProps extends Omit<ButtonProps, 'children' | 'loading'> {
  children: React.ReactNode
  loading: boolean
  loadingText?: string
}

export function LoadingButton({
  children,
  loading,
  loadingText = 'Memproses...',
  disabled,
  ...rest
}: LoadingButtonProps) {
  return (
    <Button {...rest} loading={loading} disabled={disabled || loading}>
      {loading ? loadingText : children}
    </Button>
  )
}
