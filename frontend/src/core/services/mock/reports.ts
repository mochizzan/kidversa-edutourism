import type { Report } from '../../types'
import type { ReportService } from '../types'
import { ReportStatus } from '../../types'
import { mockStorage } from './db'
import { seedParticipants } from './data/seed'

const STORAGE_KEY = 'reports_v1'

const init = (): Report[] => {
  const existing = mockStorage.get<Report[]>(STORAGE_KEY, [])
  if (existing.length) return existing
  const seed: Report[] = [
    {
      id: 'rpt-1',
      participant_id: 'part-4',
      session_id: 's-3',
      ai_narrative_draft:
        'Dewi Putri hari ini menunjukkan antusiasme yang luar biasa dalam mengikuti program hidroponik. Ia aktif bertanya tentang cara menanam sayur dan sangat bersemangat saat melihat tanaman tumbuh. Dewi juga pandai bekerja sama dengan teman-teman sekelompoknya.',
      ai_narrative_final: undefined,
      mission_ids_json: [],
      report_pdf_url: undefined,
      parent_access_token: 'parent-token-dewi-123',
      status: ReportStatus.DRAFT,
      generated_at: '2026-06-20T08:00:00.000Z',
    },
    {
      id: 'rpt-2',
      participant_id: 'part-1',
      session_id: 's-1',
      ai_narrative_draft:
        'Budi Santoso mengikuti kegiatan dengan penuh semangat. Ia sangat tertarik dengan sapi dan banyak bertanya tentang makanan sapi. Budi mampu mengikuti instruksi dengan baik dan aktif berpartisipasi dalam setiap tahapan.',
      ai_narrative_final: undefined,
      mission_ids_json: [],
      report_pdf_url: undefined,
      parent_access_token: 'parent-token-budi-456',
      status: ReportStatus.DRAFT,
    },
  ]
  mockStorage.set(STORAGE_KEY, seed)
  return seed
}

const getAll = (): Report[] => mockStorage.get<Report[]>(STORAGE_KEY, init())

const getBySession = async (sessionId: string): Promise<Report[]> => {
  await new Promise((r) => setTimeout(r, 150))
  return getAll().filter((r) => r.session_id === sessionId)
}

const getById = async (id: string): Promise<Report | null> => {
  await new Promise((r) => setTimeout(r, 100))
  return getAll().find((r) => r.id === id) ?? null
}

const generate = async (sessionId: string): Promise<Report[]> => {
  await new Promise((r) => setTimeout(r, 1000))
  const all = getAll()
  const participants = seedParticipants.filter(
    (p: { session_id: string }) => p.session_id === sessionId
  )
  const existingIds = new Set(all.map((r) => r.participant_id))
  for (const p of participants) {
    if (!existingIds.has(p.id)) {
      const report: Report = {
        id: `rpt-${Date.now()}-${p.id}`,
        participant_id: p.id,
        session_id: sessionId,
        ai_narrative_draft: `${p.child_name} mengikuti kegiatan hari ini dengan baik. Anak ini menunjukkan minat yang besar dan aktif berpartisipasi. Terus kembangkan semangat belajarnya!`,
        ai_narrative_final: undefined,
        mission_ids_json: [],
        report_pdf_url: undefined,
        parent_access_token: `parent-token-${p.id}-${Date.now()}`,
        status: ReportStatus.DRAFT,
      }
      all.push(report)
    }
  }
  mockStorage.set(STORAGE_KEY, all)
  return getBySession(sessionId)
}

const approve = async (reportId: string): Promise<Report> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = getAll()
  const report = all.find((r) => r.id === reportId)
  if (!report) throw new Error('Report not found')
  report.status = ReportStatus.APPROVED
  report.ai_narrative_final = report.ai_narrative_draft
  mockStorage.set(STORAGE_KEY, all)
  return report
}

const send = async (reportId: string): Promise<Report> => {
  await new Promise((r) => setTimeout(r, 300))
  const all = getAll()
  const report = all.find((r) => r.id === reportId)
  if (!report) throw new Error('Report not found')
  report.status = ReportStatus.SENT
  report.sent_at = new Date().toISOString()
  mockStorage.set(STORAGE_KEY, all)
  return report
}

export const mockReportService: ReportService = {
  getBySession,
  getById,
  generate,
  approve,
  send,
}
