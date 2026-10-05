import { tIfExists } from '../i18n'

/** Session-status → admin.status.* label keys (present in every locale
 *  catalog). Shared by every component that renders a session status badge. */
const SESSION_STATUS_LABEL_KEYS: Record<string, string> = {
 DRAFT: 'admin.status.draft',
 ACTIVE: 'admin.status.active',
 COMPLETED: 'admin.status.completed',
 CANCELLED: 'admin.status.cancelled',
}

/** Localized session-status label with the raw value as fallback for unknown
 *  statuses. Reads i18n directly so callers need no translation hook — every
 *  call site renders inside a `useTranslation` component, which re-renders on
 *  language change. */
export function sessionStatusLabel(status: string): string {
 const key = SESSION_STATUS_LABEL_KEYS[status]
 return (key ? tIfExists(key) : undefined) ?? status
}
