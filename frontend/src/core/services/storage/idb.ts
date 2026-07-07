import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'kidversa_db';
const DB_VERSION = 2;

export type StoreName =
  | 'tenants'
  | 'users'
  | 'programs'
  | 'program_stages'
  | 'stage_contents'
  | 'photo_frames'
  | 'mission_banks'
  | 'sessions'
  | 'session_stages'
  | 'session_groups'
  | 'group_stage_progress'
  | 'participants'
  | 'assessments'
  | 'smart_photos'
  | 'recordings'
  | 'reports'
  | 'participant_missions'
  | 'consent_logs'
  | 'timeline_events'
  | 'sync_queue'
  | 'media_blobs';

let dbInstance: IDBPDatabase | null = null;

export async function initDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // tenants
      if (!db.objectStoreNames.contains('tenants')) {
        const tenants = db.createObjectStore('tenants', { keyPath: 'id' });
        tenants.createIndex('slug', 'slug', { unique: true });
      }

      // users
      if (!db.objectStoreNames.contains('users')) {
        const users = db.createObjectStore('users', { keyPath: 'id' });
        users.createIndex('tenant_id', 'tenant_id');
        users.createIndex('email', 'email', { unique: true });
      }

      // programs
      if (!db.objectStoreNames.contains('programs')) {
        db.createObjectStore('programs', { keyPath: 'id' });
      }

      // program_stages
      if (!db.objectStoreNames.contains('program_stages')) {
        const programStages = db.createObjectStore('program_stages', { keyPath: 'id' });
        programStages.createIndex('program_id', 'program_id');
        programStages.createIndex('program_sequence', ['program_id', 'sequence_order']);
      }

      // stage_contents
      if (!db.objectStoreNames.contains('stage_contents')) {
        const stageContents = db.createObjectStore('stage_contents', { keyPath: 'id' });
        stageContents.createIndex('program_stage_id', 'program_stage_id');
        stageContents.createIndex('stage_sort', ['program_stage_id', 'sort_order']);
      }

      // photo_frames
      if (!db.objectStoreNames.contains('photo_frames')) {
        db.createObjectStore('photo_frames', { keyPath: 'id' });
      }

      // mission_banks
      if (!db.objectStoreNames.contains('mission_banks')) {
        db.createObjectStore('mission_banks', { keyPath: 'id' });
      }

      // sessions
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }

      // session_stages
      if (!db.objectStoreNames.contains('session_stages')) {
        const sessionStages = db.createObjectStore('session_stages', { keyPath: 'id' });
        sessionStages.createIndex('session_id', 'session_id');
        sessionStages.createIndex('program_stage_id', 'program_stage_id');
      }

      // session_groups
      if (!db.objectStoreNames.contains('session_groups')) {
        const sessionGroups = db.createObjectStore('session_groups', { keyPath: 'id' });
        sessionGroups.createIndex('session_id', 'session_id');
      }

      // group_stage_progress
      if (!db.objectStoreNames.contains('group_stage_progress')) {
        const groupProgress = db.createObjectStore('group_stage_progress', { keyPath: 'id' });
        groupProgress.createIndex('group_id', 'group_id');
        groupProgress.createIndex('session_stage_id', 'session_stage_id');
      }

      // participants
      if (!db.objectStoreNames.contains('participants')) {
        const participants = db.createObjectStore('participants', { keyPath: 'id' });
        participants.createIndex('session_id', 'session_id');
        participants.createIndex('group_id', 'group_id');
        participants.createIndex('session_group', ['session_id', 'group_id']);
      }

      // assessments
      if (!db.objectStoreNames.contains('assessments')) {
        const assessments = db.createObjectStore('assessments', { keyPath: 'id' });
        assessments.createIndex('participant_id', 'participant_id');
        assessments.createIndex('session_stage_id', 'session_stage_id');
        assessments.createIndex('participant_stage', ['participant_id', 'session_stage_id']);
      }

      // smart_photos
      if (!db.objectStoreNames.contains('smart_photos')) {
        const smartPhotos = db.createObjectStore('smart_photos', { keyPath: 'id' });
        smartPhotos.createIndex('participant_id', 'participant_id');
        smartPhotos.createIndex('session_id', 'session_id');
        smartPhotos.createIndex('sync_status', 'sync_status');
      }

      // recordings
      if (!db.objectStoreNames.contains('recordings')) {
        const recordings = db.createObjectStore('recordings', { keyPath: 'id' });
        recordings.createIndex('participant_id', 'participant_id');
        recordings.createIndex('session_stage_id', 'session_stage_id');
        recordings.createIndex('sync_status', 'sync_status');
      }

      // reports
      if (!db.objectStoreNames.contains('reports')) {
        const reports = db.createObjectStore('reports', { keyPath: 'id' });
        reports.createIndex('session_id', 'session_id');
        reports.createIndex('participant_id', 'participant_id');
        reports.createIndex('parent_access_token', 'parent_access_token');
      }

      // participant_missions
      if (!db.objectStoreNames.contains('participant_missions')) {
        const participantMissions = db.createObjectStore('participant_missions', { keyPath: 'id' });
        participantMissions.createIndex('participant_id', 'participant_id');
        participantMissions.createIndex('report_id', 'report_id');
      }

      // consent_logs
      if (!db.objectStoreNames.contains('consent_logs')) {
        const consentLogs = db.createObjectStore('consent_logs', { keyPath: 'id' });
        consentLogs.createIndex('participant_id', 'participant_id');
      }

      // timeline_events
      if (!db.objectStoreNames.contains('timeline_events')) {
        const timelineEvents = db.createObjectStore('timeline_events', { keyPath: 'id' });
        timelineEvents.createIndex('session_id', 'session_id');
        timelineEvents.createIndex('group_id', 'group_id');
      }

      // sync_queue
      if (!db.objectStoreNames.contains('sync_queue')) {
        const syncQueue = db.createObjectStore('sync_queue', { keyPath: 'id' });
        syncQueue.createIndex('status', 'status');
        syncQueue.createIndex('resource_id', 'resource_id');
        syncQueue.createIndex('resource_key', ['resource_type', 'resource_id']);
      }

      // media_blobs
      if (!db.objectStoreNames.contains('media_blobs')) {
        const mediaBlobs = db.createObjectStore('media_blobs', { keyPath: 'id' });
        mediaBlobs.createIndex('resource_key', ['resource_type', 'resource_id']);
      }
    },
  });

  return dbInstance;
}

export async function getDB(): Promise<IDBPDatabase> {
  if (!dbInstance) {
    return await initDB();
  }
  return dbInstance;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDB();
  return db.getAll(store) as Promise<T[]>;
}

export async function getById<T>(store: StoreName, id: string): Promise<T | null> {
  const db = await getDB();
  const result = await db.get(store, id);
  return result ?? null;
}

export async function put<T extends { id: string }>(store: StoreName, item: T): Promise<T> {
  const db = await getDB();
  await db.put(store, item);
  return item;
}

export async function putMany<T extends { id: string }>(
  store: StoreName,
  items: T[],
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(items.map((item) => tx.store.put(item)));
  await tx.done;
}

export async function deleteById(store: StoreName, id: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, id);
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await getDB();
  await db.clear(store);
}

export async function queryByIndex<T>(
  store: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await getDB();
  return db.getAllFromIndex(store, indexName, value) as Promise<T[]>;
}

export async function countByIndex(
  store: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<number> {
  const db = await getDB();
  return db.countFromIndex(store, indexName, value);
}

export async function deleteByIndex(
  store: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<void> {
  const db = await getDB();
  const keys = await db.getAllKeysFromIndex(store, indexName, value);
  const tx = db.transaction(store, 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}
