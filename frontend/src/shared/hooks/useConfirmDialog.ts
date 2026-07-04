import { useState, useCallback } from 'react'

interface ConfirmDialogState {
  open: boolean
  targetId: string | null
}

interface UseConfirmDialogResult {
  open: boolean
  targetId: string | null
  requestConfirm: (id: string) => void
  dismiss: () => void
}

export function useConfirmDialog(): UseConfirmDialogResult {
  const [state, setState] = useState<ConfirmDialogState>({ open: false, targetId: null })

  const requestConfirm = useCallback((id: string) => {
    setState({ open: true, targetId: id })
  }, [])

  const dismiss = useCallback(() => {
    setState({ open: false, targetId: null })
  }, [])

  return { open: state.open, targetId: state.targetId, requestConfirm, dismiss }
}
