import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Star,
  Camera,
  FileText,
  Printer,
  Target,
  Sparkles,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { photoService } from '../../../core/services/photos'
import type { Assessment, SmartPhoto, Session } from '../../../core/types'
import { ReportStatus } from '../../../core/types/enums'
import { formatDate, cn } from '../../../core/utils'
import { seedProgramStages } from '../../../core/services/mock/data/seed'

/* ── Status helpers ── */
const statusBadge: Record<string, 'neutral' | 'warning' | 'success' | 'primary'> = {
  [ReportStatus.DRAFT]: 'neutral',
  [ReportStatus.PENDING_REVIEW]: 'warning',
  [ReportStatus.APPROVED]: 'success',
  [ReportStatus.SENT]: 'primary',
}

const statusLabel: Record<string, string> = {
  [ReportStatus.DRAFT]: 'Draft',
  [ReportStatus.PENDING_REVIEW]: 'Review',
  [ReportStatus.APPROVED]: 'Disetujui',
  [ReportStatus.SENT]: 'Terkirim',
}

/* ── Inner report component ── */
function ReportView() {
  const { report, participant, loading: guardLoading, error: guardError } = useParentToken()

  const [session, setSession] = useState<Session | null>(null)
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [photo, setPhoto] = useState<SmartPhoto | null>(null)
  const [stageNames, setStageNames] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showPrintToast, setShowPrintToast] = useState(false)

  useEffect(() => {
    if (!report || !participant) return

    const loadDetails = async () => {
      try {
        const [sess, sessAssessments, sessPhotos, sessStages] = await Promise.all([
          sessionService.getById(report.session_id),
          assessmentService.getBySession(report.session_id),
          photoService.getBySession(report.session_id),
          sessionService.getStages(report.session_id),
        ])

        if (sess) setSession(sess)

        // Filter assessments for this participant
        const partAssessments = sessAssessments.filter(
          (a) => a.participant_id === participant.id
        )
        setAssessments(partAssessments)

        // Build stage name map: session_stage_id -> program stage name
        const stageNamesMap: Record<string, string> = {}
        sessStages.forEach((ss) => {
          const pgStage = seedProgramStages.find((ps) => ps.id === ss.program_stage_id)
          if (pgStage) {
            stageNamesMap[ss.id] = pgStage.name
          }
        })
        setStageNames(stageNamesMap)

        // Find report photo
        const reportPhoto =
          sessPhotos.find(
            (p) => p.participant_id === participant.id && p.is_report_photo
          ) || sessPhotos.find((p) => p.participant_id === participant.id) || null
        setPhoto(reportPhoto)
      } catch {
        setError('Gagal memuat detail laporan.')
      }
    }

    loadDetails()
  }, [report, participant])

  const handlePrint = () => {
    window.print()
    setShowPrintToast(true)
    setTimeout(() => setShowPrintToast(false), 2000)
  }

  /* ── Guard loading ── */
  if (guardLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-on-surface-variant">Memuat laporan...</p>
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (guardError || error || !report || !participant) {
    return (
      <div className="py-8">
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="Laporan tidak tersedia"
          description={
            guardError === 'INVALID'
              ? 'Tautan tidak valid.'
              : guardError === 'EXPIRED'
              ? 'Laporan sudah tidak tersedia.'
              : error || 'Terjadi kesalahan saat memuat laporan.'
          }
        />
      </div>
    )
  }

  const narrative = report.ai_narrative_final || report.ai_narrative_draft || ''

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-on-surface">Laporan Perkembangan</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {participant.child_name}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant={statusBadge[report.status] || 'neutral'} size="sm">
            {statusLabel[report.status] || report.status}
          </Badge>
          {session && (
            <span className="text-xs text-on-surface-variant">
              {session.name} - {formatDate(session.session_date)}
            </span>
          )}
        </div>
      </div>

      {/* Child identity + Photo */}
      <Card>
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 rounded-2xl bg-surface-variant flex items-center justify-center shrink-0 overflow-hidden">
            {photo ? (
              <img
                src={photo.framed_file_url || photo.original_file_url}
                alt={participant.child_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Camera className="w-8 h-8 text-on-surface-variant" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-on-surface">{participant.child_name}</h2>
            <div className="text-sm text-on-surface-variant mt-1 space-y-0.5">
              <p>Usia: {participant.child_age} tahun</p>
              {participant.school_name && <p>Sekolah: {participant.school_name}</p>}
              <p>Orang Tua: {participant.parent_name}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Assessment scores */}
      <Card title="Penilaian per Tahapan">
        {assessments.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-4">
            Belum ada data penilaian.
          </p>
        ) : (
          <div className="space-y-3">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="p-3 rounded-xl bg-surface-container-low"
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-on-surface">
                    {stageNames[a.session_stage_id] || 'Tahap Kegiatan'}
                  </p>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={cn(
                          'w-4 h-4',
                          star <= a.star_rating
                            ? 'text-accent fill-accent'
                            : 'text-on-surface-variant/30'
                        )}
                      />
                    ))}
                  </div>
                </div>
                {a.comment && (
                  <p className="text-sm text-on-surface-variant italic mt-1">
                    &ldquo;{a.comment}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Narrative */}
      {narrative && (
        <Card title="Narasi Perkembangan">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-on-surface leading-relaxed">{narrative}</p>
          </div>
        </Card>
      )}

      {/* Missions link */}
      {report.mission_ids_json && report.mission_ids_json.length > 0 && (
        <Link
          to={`/parent/missions?token=${encodeURIComponent(report.parent_access_token)}&reportId=${report.id}`}
          className="block bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-5 text-white hover:opacity-95 transition-opacity"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Target className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Lihat Misi Lanjutan</h3>
              <p className="text-sm text-white/80 mt-0.5">
                {report.mission_ids_json.length} misi untuk dilakukan bersama si kecil
              </p>
            </div>
            <span className="text-2xl">&rarr;</span>
          </div>
        </Link>
      )}

      {/* Download PDF */}
      <Button className="w-full" variant="secondary" onClick={handlePrint}>
        <Printer className="w-4 h-4 mr-2" /> Download / Cetak PDF
      </Button>

      {/* Print toast */}
      {showPrintToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-on-surface text-surface px-4 py-2 rounded-xl shadow-lg text-sm z-50">
          Gunakan browser: File &rarr; Print atau Ctrl+P
        </div>
      )}
    </div>
  )
}

/* ── Page wrapper ── */
const ReportPage = () => {
  return (
    <ParentTokenGuard>
      <ReportView />
    </ParentTokenGuard>
  )
}

export default ReportPage
