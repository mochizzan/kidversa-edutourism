import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import {
  FileText,
  Send,
  ArrowLeft,
  RefreshCw,
  Search,
  AlertTriangle,
  User,
  Star,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Modal } from '../../../shared/components/ui/Modal'
import { ReportStatus } from '../../../core/types/enums'
import { formatDate } from '../../../core/utils'
import { reportStatusBadge, reportStatusLabel } from '../../../core/constants/reportStatus'
import { useReportSession } from '../hooks/useReportSession'

const ReportSessionPage = () => {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const {
    session,
    reports,
    participants,
    loading,
    error,
    search,
    setSearch,
    generating,
    sending,
    genError,
    missingParticipants,
    setMissingParticipants,
    filteredReports,
    approvedCount,
    loadData,
    handleGenerateAll,
    handleSendAll,
  } = useReportSession(sessionId)

  const [showMissingModal, setShowMissingModal] = useState(false)
  const [showConfirmSend, setShowConfirmSend] = useState(false)

  const onGenerate = async () => {
    const ok = await handleGenerateAll()
    if (!ok && missingParticipants.length > 0) setShowMissingModal(true)
  }

  const onSend = async () => {
    const ok = await handleSendAll()
    if (ok) setShowConfirmSend(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Memuat..."
          breadcrumbs={[{ label: 'Laporan', href: ROUTES.ADMIN.REPORTS }, { label: 'Detail' }]}
        />
        <div className="bg-surface rounded-2xl p-6 animate-pulse space-y-4">
          <div className="h-5 bg-surface-variant rounded w-48" />
          <div className="h-4 bg-surface-variant rounded w-32" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-surface-variant rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Error"
          breadcrumbs={[{ label: 'Laporan', href: ROUTES.ADMIN.REPORTS }, { label: 'Detail' }]}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => navigate(ROUTES.ADMIN.REPORTS)}>
            Kembali
          </Button>
        </div>
        <ErrorState message={error || 'Sesi tidak ditemukan.'} onRetry={loadData} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name}
        subtitle={`${formatDate(session.session_date)} — ${session.location}`}
        breadcrumbs={[{ label: 'Laporan', href: ROUTES.ADMIN.REPORTS }, { label: session.name }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.ADMIN.REPORTS)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            Total Laporan
          </p>
          <p className="text-2xl font-bold text-on-surface mt-1">{reports.length}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            Draft
          </p>
          <p className="text-2xl font-bold text-on-surface mt-1">
            {reports.filter((r) => r.report.status === ReportStatus.DRAFT).length}
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            Disetujui
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">{approvedCount}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            Terkirim
          </p>
          <p className="text-2xl font-bold text-primary mt-1">
            {reports.filter((r) => r.report.status === ReportStatus.SENT).length}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onGenerate} disabled={generating || reports.length === participants.length}>
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengenerate...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" /> Generate Laporan
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowConfirmSend(true)}
          disabled={approvedCount === 0 || sending}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengirim...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> Kirim Semua ({approvedCount})
            </>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={loadData}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {genError && (
        <div className="bg-error-container text-on-error-container rounded-2xl p-4 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {genError}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari peserta..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant bg-surface text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
        />
      </div>

      {filteredReports.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title={search ? 'Peserta tidak ditemukan' : 'Belum ada laporan'}
          description={
            search ? 'Coba gunakan kata kunci lain.' : 'Generate laporan untuk peserta sesi ini.'
          }
        />
      ) : (
        <div className="grid gap-3">
          {filteredReports.map((item) => (
            <Link
              key={item.report.id}
              to={`/admin/reports/${sessionId}/review/${item.report.id}`}
              className="block bg-surface rounded-2xl border border-outline-variant hover:shadow-md hover:border-primary-container transition-all duration-200 p-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface truncate">
                      {item.participant.child_name}
                    </p>
                    <Badge variant={reportStatusBadge[item.report.status]} size="sm">
                      {reportStatusLabel[item.report.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-on-surface-variant mt-0.5">
                    {item.avgRating > 0 && (
                      <span className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-accent fill-accent" />
                        {item.avgRating.toFixed(1)}
                      </span>
                    )}
                    {item.participant.school_name && <span>{item.participant.school_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {item.report.status === ReportStatus.APPROVED && (
                    <span className="text-xs text-green-600 font-medium">Siap kirim</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={showMissingModal}
        onClose={() => {
          setShowMissingModal(false)
          setMissingParticipants([])
        }}
        title="Data Penilaian Belum Lengkap"
        size="md"
        footer={
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setShowMissingModal(false)
                setMissingParticipants([])
              }}
            >
              Mengerti
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-on-surface-variant">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <p>
              Peserta berikut belum memiliki data penilaian. Silakan lengkapi penilaian terlebih
              dahulu sebelum generate laporan.
            </p>
          </div>
          <ul className="space-y-2">
            {missingParticipants.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-surface-variant text-sm"
              >
                <User className="w-4 h-4 text-on-surface-variant" />
                <span className="font-medium text-on-surface">{p.child_name}</span>
                <span className="text-on-surface-variant">({p.school_name || '-'})</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        open={showConfirmSend}
        onClose={() => setShowConfirmSend(false)}
        title="Konfirmasi Kirim Laporan"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowConfirmSend(false)}>
              Batal
            </Button>
            <Button onClick={onSend} disabled={sending}>
              {sending ? 'Mengirim...' : `Kirim ${approvedCount} Laporan`}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <Send className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-on-surface-variant">
            <p>
              Anda akan mengirim <strong>{approvedCount} laporan</strong> yang sudah disetujui kepada
              orang tua/wali masing-masing peserta.
            </p>
            <p className="mt-2">Tindakan ini tidak dapat dibatalkan.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ReportSessionPage
