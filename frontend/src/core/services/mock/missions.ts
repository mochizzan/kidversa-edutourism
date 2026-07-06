import type { MissionBank, CreateMissionBankDTO } from '../../types'
import type { MissionBankService } from '../types'
import { MissionCategory } from '../../types'
import { mockStorage } from './db'

const STORAGE_KEY = 'missions_v1'

const init = (): MissionBank[] => {
  const existing = mockStorage.get<MissionBank[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: MissionBank[] = [
    // Program p-1: Edukasi Peternakan Sapi — HOME
    {
      id: 'm-1',
      program_id: 'p-1',
      category: MissionCategory.HOME,
      title_child: 'Gambar sapi kesukaanku',
      title_parent: 'Minta anak menggambar sapi yang paling berkesan',
      description_parent: 'Ajak anak menggambar sapi yang paling ia ingat dari kunjungan hari ini. Tanyakan detail seperti warna, ukuran, dan suaranya.',
      related_stage_ids: ['ps-2'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-2',
      program_id: 'p-1',
      category: MissionCategory.HOME,
      title_child: 'Ceritakan pengalaman hari ini',
      title_parent: 'Minta anak bercerita tentang pengalaman',
      description_parent: 'Duduk bersama anak dan minta ia menceritakan pengalaman paling menyenangkan hari ini. Catat hal-hal menarik yang ia sampaikan.',
      related_stage_ids: ['ps-1', 'ps-2', 'ps-3'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-3',
      program_id: 'p-1',
      category: MissionCategory.HOME,
      title_child: 'Minum susu sapi',
      title_parent: 'Ajak anak minum susu sapi dan diskusi',
      description_parent: 'Sediakan susu sapi untuk anak. Diskusikan dari mana susu berasal dan bagaimana prosesnya sampai ke meja makan.',
      related_stage_ids: ['ps-3'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    // Program p-1: PARENT
    {
      id: 'm-4',
      program_id: 'p-1',
      category: MissionCategory.PARENT,
      title_child: 'Kunjungi pasar bersama',
      title_parent: 'Ajak anak ke pasar tanyakan sayuran dari mana',
      description_parent: 'Bawa anak ke pasar tradisional. Minta anak bertanya kepada pedagang dari mana sayuran berasal.',
      related_stage_ids: ['ps-1'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-5',
      program_id: 'p-1',
      category: MissionCategory.PARENT,
      title_child: 'Baca buku tentang sapi',
      title_parent: 'Cari buku tentang sapi di perpustakaan',
      description_parent: 'Kunjungi perpustakaan atau toko buku dan cari buku cerita tentang sapi atau kehidupan peternakan.',
      related_stage_ids: ['ps-2'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-6',
      program_id: 'p-1',
      category: MissionCategory.PARENT,
      title_child: 'Tonton video edukasi sapi',
      title_parent: 'Tonton video tentang sapi bersama',
      description_parent: 'Cari video edukasi tentang sapi di YouTube dan tonton bersama anak. Diskusikan hal-hal baru yang dipelajari.',
      related_stage_ids: ['ps-2', 'ps-3'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    // Program p-1: SCHOOL
    {
      id: 'm-7',
      program_id: 'p-1',
      category: MissionCategory.SCHOOL,
      title_child: 'Ceritakan ke teman-teman',
      title_parent: 'Anak bercerita tentang pengalaman di sekolah',
      description_parent: 'Minta anak menceritakan pengalaman hari ini kepada teman-teman di sekolah. Dorong ia untuk menunjukkan foto-foto.',
      related_stage_ids: ['ps-1', 'ps-2', 'ps-3'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-8',
      program_id: 'p-1',
      category: MissionCategory.SCHOOL,
      title_child: 'Buat kolase sapi',
      title_parent: 'Bantu anak membuat kolase sapi dari kertas',
      description_parent: 'Sediakan kertas warna, gunting, dan lem. Bantu anak membuat kolase sapi dari potongan kertas.',
      related_stage_ids: ['ps-1'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm-9',
      program_id: 'p-1',
      category: MissionCategory.SCHOOL,
      title_child: 'Tulis 3 hal baru',
      title_parent: 'Anak menulis 3 hal baru yang dipelajari',
      description_parent: 'Minta anak menulis (atau menggambar) 3 hal baru yang ia pelajari hari ini tentang sapi dan peternakan.',
      related_stage_ids: ['ps-2', 'ps-3'],
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = async (params?: {
  page?: number
  limit?: number
  search?: string
  filters?: Record<string, string | boolean | undefined>
}): Promise<{
  data: MissionBank[]
  total: number
  page: number
  limit: number
  totalPages: number
}> => {
  await new Promise((r) => setTimeout(r, 200))
  let data = init()
  if (params?.search) {
    const q = params.search.toLowerCase()
    data = data.filter(
      (m) =>
        m.title_child.toLowerCase().includes(q) ||
        m.title_parent.toLowerCase().includes(q)
    )
  }
  if (params?.filters?.program_id) {
    data = data.filter((m) => m.program_id === params.filters!.program_id)
  }
  if (params?.filters?.category) {
    data = data.filter((m) => m.category === params.filters!.category)
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

const create = async (data: CreateMissionBankDTO): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = init()
  const mission: MissionBank = {
    id: `m-${Date.now()}`,
    program_id: data.program_id,
    category: data.category,
    title_child: data.title_child,
    title_parent: data.title_parent,
    description_parent: data.description_parent,
    related_stage_ids: data.related_stage_ids,
    is_active: true,
    created_at: new Date().toISOString(),
  }
  all.push(mission)
  mockStorage.set(STORAGE_KEY, all)
  return mission
}

const update = async (
  id: string,
  data: Partial<CreateMissionBankDTO>
): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = init()
  const idx = all.findIndex((m) => m.id === id)
  if (idx === -1) throw new Error('Mission not found')
  all[idx] = { ...all[idx], ...data }
  mockStorage.set(STORAGE_KEY, all)
  return all[idx]
}

const remove = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = init().filter((m) => m.id !== id)
  mockStorage.set(STORAGE_KEY, all)
}

const toggleActive = async (id: string): Promise<MissionBank> => {
  await new Promise((r) => setTimeout(r, 200))
  const all = init()
  const item = all.find((m) => m.id === id)
  if (!item) throw new Error('Mission not found')
  item.is_active = !item.is_active
  mockStorage.set(STORAGE_KEY, all)
  return item
}

export const mockMissionService: MissionBankService = {
  getAll,
  create,
  update,
  delete: remove,
  toggleActive,
}
