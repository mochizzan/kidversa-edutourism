import { ApiError } from '../../../core/services/backend-client'
import { friendlyError } from '../../../core/utils/errorMessages'

/**
 * Canonical client-side message for the COMPLETED-group lock.
 *
 * Source of truth: `backend/internal/pkg/response/response.go` MessageForCode
 * ("group_completed") — keep this string byte-identical to that backend
 * message so a locally-guarded toast reads exactly like the real server
 * rejection: "Kelompok sudah diselesaikan; kehadiran dan penilaian tidak dapat diubah lagi."
 */
export const GROUP_COMPLETED_MESSAGE =
 'Kelompok sudah diselesaikan; kehadiran dan penilaian tidak dapat diubah lagi.'

/**
 * Friendly toast text for a local COMPLETED-group guard: resolves the
 * `group_completed` code through friendlyError (localized key if one exists,
 * this message otherwise) — one construction site for all guard toasts.
 */
export function groupCompletedErrorMessage(): string {
 return friendlyError(new ApiError(GROUP_COMPLETED_MESSAGE, 'group_completed', 403))
}
