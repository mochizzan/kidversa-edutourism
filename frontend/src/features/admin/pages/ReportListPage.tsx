import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Calendar, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { sessionService } from '../../../core/services/sessions'
import { reportService } from '../../../core/services/reports'
import type { Session, Report } from '../../../core/types'
import { ReportStatus } from '../../../core/types/enums'
import { formatDate, cn } from '../../../core/utils'

/* ── Helpers ── */
const statusVariant: Record<string, 'primary' | 'success' | 'neutral' | 'danger' | 'warning'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  COMPLETED: 'primary',
  CANCELLED: 'danger',
}

/* ── Interface ── */
interface SessionWithReports {
  session: Session
  reports: Report[]
  reportCount: number
  sentCount: number
  draftCount: number
  overallStatus: 'none' | 'draft' | 'in_progress' | 'all_sent'
}

/* ── Page ── */
const ReportListPage = () => {
  const [sessions, setSessions] = useState<SessionWithReports[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sessionService.getAll({ limit: 50 })
      const sessionWithReports: SessionWithReports[] = []

      for (const session of result.data) {
        const reports = await reportService.getBySession(session.id)
        const sentCount = reports.filter((r) => r.status === ReportStatus.SENT).length
        const draftCount = reports.filter(
          (r) => r.status === ReportStatus.DRAFT || r.status === ReportStatus.PENDING_REVIEW
        ).length
        let overallStatus: SessionWithReports['overallStatus'] = 'none'
        if (reports.length > 0 && sentCount === reports.length) {
          overallStatus = 'all_sent'
        } else if (draftCount === reports.length) {
          overallStatus = 'draft'
        } else if (reports.length > 0) {
          overallStatus = 'in_progress'
        }

        sessionWithReports.push({
          session,
          reports,
          reportCount: reports.length,
          sentCount,
          draftCount,
          overallStatus,
        })
      }

      setSessions(sessionWithReports)
    } catch {
      setError('Gagal memuat data laporan. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredSessions = useMemo(() => {
    if (filter === 'all') return sessions
    if (filter === 'has_reports') return sessions.filter((s) => s.reportCount > 0)
    if (filter === 'no_reports') return sessions.filter((s) => s.reportCount === 0)
    if (filter === 'draft') return sessions.filter((s) => s.draftCount > 0)
    if (filter === 'sent') return sessions.filter((s) => s.sentCount > 0)
    return sessions
  }, [sessions, filter])

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Laporan" subtitle="Kelola laporan penilaian untuk setiap sesi." />
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-surface-variant rounded w-48 mb-3" />
              <div className="h-4 bg-surface-variant rounded w-32 mb-2" />
              <div className="h-4 bg-surface-variant rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Laporan" subtitle="Kelola laporan penilaian untuk setiap sesi." />
        <ErrorState message={error} onRetry={loadData} />
      </div>
    )
  }

  /* ── Empty ── */
  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Laporan" subtitle="Kelola laporan penilaian untuk setiap sesi." />
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="Belum ada sesi"
          description="Buat sesi terlebih dahulu untuk mulai membuat laporan."
        />
      </div>
    )
  }

  /* ── Filters ── */
  const filters = [
    { key: 'all', label: 'Semua' },
    { key: 'has_reports', label: 'Ada Laporan' },
    { key: 'no_reports', label: 'Belum Ada' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Terkirim' },
  ]

  /* ── Render ── */
  return (
    <div className="space-y-6">
      <PageHeader
        title="Laporan"
        subtitle="Kelola laporan penilaian untuk setiap sesi."
        actions={
          <Button variant="secondary" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-primary text-white'
                : 'bg-surface-variant text-on-surface-variant hover:bg-surface-container'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Session list */}
      {filteredSessions.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="Tidak ada sesi"
          description="Tidak ada sesi yang sesuai dengan filter yang dipilih."
        />
      ) : (
        <div className="grid gap-4">
          {filteredSessions.map(({ session, reportCount, sentCount, draftCount, overallStatus }) => (
            <Link
              key={session.id}
              to={`/admin/reports/${session.id}`}
              className="block bg-surface rounded-2xl shadow-sm border border-outline-variant hover:shadow-md hover:border-primary-container transition-all duration-200"
            >
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-on-surface truncate">{session.name}</h3>
                      <Badge variant={statusVariant[session.status] || 'neutral'} size="sm">
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(session.session_date)}
                      </span>
                      <span>{session.location}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-on-surface-variant shrink-0 ml-4" />
                </div>

                {reportCount > 0 && (
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span className="text-on-surface-variant">
                      {reportCount} laporan
                    </span>
                    {sentCount > 0 && (
                      <Badge variant="primary" size="sm">{sentCount} terkirim</Badge>
                    )}
                    {draftCount > 0 && (
                      <Badge variant="neutral" size="sm">{draftCount} draft</Badge>
                    )}
                  </div>
                )}

                {overallStatus !== 'none' && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        overallStatus === 'all_sent' && 'bg-green-500',
                        overallStatus === 'in_progress' && 'bg-yellow-500',
                        overallStatus === 'draft' && 'bg-gray-400',
                      )} />
                      <span className="text-xs text-on-surface-variant">
                        {overallStatus === 'all_sent' && 'Semua laporan sudah dikirim'}
                        {overallStatus === 'in_progress' && 'Beberapa laporan sudah diproses'}
                        {overallStatus === 'draft' && 'Laporan masih dalam bentuk draft'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReportListPage
