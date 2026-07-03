import type { PaginatedResponse, ListParams, PhotoFrame } from '../../types'
import type { FrameService } from '../types'
import { seedPhotoFrames } from './data/seed'
import { mockStorage } from './db'

const STORAGE_KEY = 'frames_v1'

const init = (): PhotoFrame[] => {
  const existing = mockStorage.get<PhotoFrame[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  mockStorage.set(STORAGE_KEY, seedPhotoFrames)
  return seedPhotoFrames
}

const getAll = async (params?: ListParams): Promise<PaginatedResponse<PhotoFrame>> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = init()
  if (params?.filters?.program_id) {
    const programId = params.filters!.program_id as string
    data = data.filter((f) => !f.program_id || f.program_id === programId)
  }
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter((f) => f.name.toLowerCase().includes(q))
  }
  const page = params?.page ?? 1
  const limit = params?.limit ?? 10
  const start = (page - 1) * limit
  return {
    data: data.slice(start, start + limit),
    total: data.length,
    page,
    limit,
    totalPages: Math.ceil(data.length / limit),
  }
}

const getById = async (id: string): Promise<PhotoFrame | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return init().find((f) => f.id === id) ?? null
}

const create = async (data: Omit<PhotoFrame, 'id' | 'created_at'>): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 300))
  const frames = init()
  const frame: PhotoFrame = {
    id: `f-${Date.now()}`,
    ...data,
    created_at: new Date().toISOString(),
  }
  frames.push(frame)
  mockStorage.set(STORAGE_KEY, frames)
  return frame
}

const update = async (id: string, data: Partial<Omit<PhotoFrame, 'id' | 'created_at'>>): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 300))
  const frames = init()
  const idx = frames.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error('Frame not found')
  frames[idx] = { ...frames[idx], ...data }
  mockStorage.set(STORAGE_KEY, frames)
  return frames[idx]
}

const deactivate = async (id: string): Promise<PhotoFrame> => {
  await new Promise((r) => setTimeout(r, 250))
  const frames = init()
  const frame = frames.find((f) => f.id === id)
  if (!frame) throw new Error('Frame not found')
  frame.is_active = false
  mockStorage.set(STORAGE_KEY, frames)
  return frame
}

export const mockFrameService: FrameService = {
  getAll,
  getById,
  create,
  update,
  deactivate,
}
