/**
 * @deprecated Use './sync/syncManager' instead. This module is a re-export adapter only.
 * The old flushSyncQueue() that falsely marked items synced without a backend has been removed.
 */
export {
  syncManager,
  enqueueSyncItem,
  getPendingSyncCount,
  getPendingSyncItems,
  markFailed,
  markDone,
  flushSyncQueue,
  clearDoneItems,
} from './sync/syncManager'

export type { SyncQueue } from './sync/syncManager'
