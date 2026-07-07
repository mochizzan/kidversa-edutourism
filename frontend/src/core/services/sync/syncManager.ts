import { put, queryByIndex, deleteById, getById } from '../storage/idb'
import type { SyncQueue } from '../../types'
import { SyncQueueStatus } from '../../types'

export type { SyncQueue }

const STORE_NAME = 'sync_queue'

export async function enqueueSyncItem(
  tenantId: string | null,
  resourceType: string,
  resourceId: string,
  action: SyncQueue['action'],
  payload: Record<string, unknown>,
  fileUrlLocal?: string
): Promise<SyncQueue> {
  const existing = await queryByIndex<SyncQueue>(STORE_NAME, 'resource_id', resourceId)
  const existingItem = existing.find(
    (item: SyncQueue) => item.resource_type === resourceType && item.status === SyncQueueStatus.PENDING
  )

  const now = new Date().toISOString()

  if (existingItem) {
    existingItem.payload_json = payload
    existingItem.action = action
    existingItem.updated_at = now
    await put(STORE_NAME, existingItem)
    return existingItem
  }

  const item: SyncQueue = {
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenant_id: tenantId,
    resource_type: resourceType,
    resource_id: resourceId,
    action,
    payload_json: payload,
    file_url_local: fileUrlLocal,
    status: SyncQueueStatus.PENDING,
    retry_count: 0,
    created_at: now,
    updated_at: now,
  }

  await put(STORE_NAME, item)
  return item
}

export async function getPendingSyncCount(): Promise<number> {
  const pending = await queryByIndex<SyncQueue>(STORE_NAME, 'status', SyncQueueStatus.PENDING)
  return pending.length
}

export async function getPendingSyncItems(): Promise<SyncQueue[]> {
  return await queryByIndex<SyncQueue>(STORE_NAME, 'status', SyncQueueStatus.PENDING)
}

export async function markFailed(itemId: string, error: string): Promise<void> {
  const item = await getById<SyncQueue>(STORE_NAME, itemId)
  if (item) {
    item.status = SyncQueueStatus.FAILED
    item.retry_count += 1
    item.error_message = error
    item.updated_at = new Date().toISOString()
    await put(STORE_NAME, item)
  }
}

export async function markDone(itemId: string): Promise<void> {
  const item = await getById<SyncQueue>(STORE_NAME, itemId)
  if (item) {
    item.status = SyncQueueStatus.DONE
    item.synced_at = new Date().toISOString()
    item.updated_at = new Date().toISOString()
    await put(STORE_NAME, item)
  }
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingSyncItems()
  let failed = 0

  for (const item of pending) {
    try {
      console.log(`[Sync] Would sync ${item.resource_type}:${item.resource_id} (${item.action})`)
      await markFailed(item.id, 'Backend not available')
      failed += 1
    } catch (err) {
      await markFailed(item.id, String(err))
      failed += 1
    }
  }

  return { synced: 0, failed }
}

export async function clearDoneItems(): Promise<void> {
  const done = await queryByIndex<SyncQueue>(STORE_NAME, 'status', SyncQueueStatus.DONE)
  for (const item of done) {
    await deleteById(STORE_NAME, item.id)
  }
}

export const syncManager = {
  enqueue: enqueueSyncItem,
  getPendingCount: getPendingSyncCount,
  getPendingItems: getPendingSyncItems,
  markDone,
  markFailed,
  flush: flushSyncQueue,
  clearDone: clearDoneItems,
}
