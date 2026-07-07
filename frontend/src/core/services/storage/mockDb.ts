import { initDB, putMany, getAll, clearStore } from './idb';
import {
  seedUsers,
  seedPrograms,
  seedProgramStages,
  seedStageContents,
  seedSessions,
  seedSessionStages,
  seedSessionGroups,
  seedParticipants,
  seedPhotoFrames,
} from '../mock/data/seed';
import { AppError } from '../../utils/errors';

const MIGRATION_KEY = 'kidversa_idb_migrated_v1';
const LS_PREFIX = 'kidversa_mock_';

let isInitialized = false;

export async function initMockDatabase(): Promise<void> {
  if (isInitialized) return;

  try {
    await initDB();

    const alreadyMigrated = localStorage.getItem(MIGRATION_KEY) === 'true';

    if (!alreadyMigrated) {
      await seedInitialData();
      await migrateFromLocalStorage();
      localStorage.setItem(MIGRATION_KEY, 'true');
    }

    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize mock database:', error);
    throw new AppError('STORAGE_ERROR', 'Gagal inisialisasi database lokal', undefined, error);
  }
}

async function seedInitialData(): Promise<void> {
  const usersCount = (await getAll('users')).length;
  if (usersCount > 0) {
    return;
  }

  await putMany('users', seedUsers);
  await putMany('programs', seedPrograms);
  await putMany('program_stages', seedProgramStages);
  await putMany('stage_contents', seedStageContents);
  await putMany('sessions', seedSessions);
  await putMany('session_stages', seedSessionStages);
  await putMany('session_groups', seedSessionGroups);
  await putMany('participants', seedParticipants);
  await putMany('photo_frames', seedPhotoFrames);
}

async function migrateFromLocalStorage(): Promise<void> {
  const keysToMigrate = Object.keys(localStorage).filter((key) => key.startsWith(LS_PREFIX));

  if (keysToMigrate.length === 0) return;

  for (const key of keysToMigrate) {
    try {
      const value = localStorage.getItem(key);
      if (!value) continue;

      const data = JSON.parse(value);
      const storeName = key.replace(LS_PREFIX, '').replace(/_v1$/, '');

      if (storeName === 'sessions' && Array.isArray(data)) {
        await putMany('sessions', data);
      } else if (storeName === 'session_groups' && Array.isArray(data)) {
        await putMany('session_groups', data);
      } else if (storeName === 'participants' && Array.isArray(data)) {
        await putMany('participants', data);
      } else if (storeName === 'assessments' && Array.isArray(data)) {
        await putMany('assessments', data);
      } else if (storeName === 'smart_photos' && Array.isArray(data)) {
        await putMany('smart_photos', data);
      } else if (storeName === 'recordings' && Array.isArray(data)) {
        await putMany('recordings', data);
      } else if (storeName === 'reports' && Array.isArray(data)) {
        await putMany('reports', data);
      } else if (storeName === 'consent_logs' && Array.isArray(data)) {
        await putMany('consent_logs', data);
      } else if (storeName === 'timeline_events' && Array.isArray(data)) {
        await putMany('timeline_events', data);
      }
    } catch (error) {
      console.warn(`Failed to migrate localStorage key: ${key}`, error);
    }
  }
}

export async function resetMockDatabase(): Promise<void> {
  const stores = [
    'users',
    'programs',
    'program_stages',
    'stage_contents',
    'photo_frames',
    'mission_banks',
    'sessions',
    'session_stages',
    'session_groups',
    'group_stage_progress',
    'participants',
    'assessments',
    'smart_photos',
    'recordings',
    'reports',
    'participant_missions',
    'consent_logs',
    'timeline_events',
    'sync_queue',
    'media_blobs',
  ];

  for (const store of stores) {
    await clearStore(store as any);
  }

  localStorage.removeItem(MIGRATION_KEY);
  isInitialized = false;

  await initMockDatabase();
}
