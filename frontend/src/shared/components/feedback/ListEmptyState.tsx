import { EmptyState } from './EmptyState'
import type { EmptyStateProps } from './EmptyState'

/**
 * Empty-state for list/detail pages where the "create" button lives in the
 * PageHeader (list pages) or Card actions (detail pages), NOT inside the
 * empty state itself.
 *
 * The `action` prop is intentionally omitted from the type so future authors
 * cannot accidentally add a duplicate create-button (compile-time guard).
 */
export function ListEmptyState(props: Omit<EmptyStateProps, 'action'>) {
 return <EmptyState {...props} />
}
