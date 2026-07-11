import { initDB, putMany, getAll, clearStore } from '../storage/idb'
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
} from './data'

const MIGRATION_KEY = 'kidversa_idb_seeded_v1'

export async function initSeedDatabase(): Promise<void> {
  await initDB()

  const alreadySeeded = localStorage.getItem(MIGRATION_KEY) === 'true'
  if (alreadySeeded) return

  const usersCount = (await getAll('users')).length
  if (usersCount > 0) {
    localStorage.setItem(MIGRATION_KEY, 'true')
    return
  }

  await putMany('users', seedUsers)
  await putMany('programs', seedPrograms)
  await putMany('program_stages', seedProgramStages)
  await putMany('stage_contents', seedStageContents)
  await putMany('sessions', seedSessions)
  await putMany('session_stages', seedSessionStages)
  await putMany('session_groups', seedSessionGroups)
  await putMany('participants', seedParticipants)
  await putMany('photo_frames', seedPhotoFrames)

  localStorage.setItem(MIGRATION_KEY, 'true')
}

export async function resetSeedDatabase(): Promise<void> {
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
  ]

  for (const store of stores) {
    await clearStore(store as Parameters<typeof clearStore>[0])
  }

  localStorage.removeItem(MIGRATION_KEY)
  await initSeedDatabase()
}
