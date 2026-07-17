import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import {
  ArrowLeft,
  Camera,
  Send,
  CheckCircle,
  Printer,
  Loader2,
  FileText,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Modal } from '../../../shared/components/ui/Modal'
import { ReportStatus } from '../../../core/types/enums'
import { formatDate } from '../../../core/utils'
import { resolveStoredUpload } from '../../../core/utils/media'
import { useReportReview } from '../hooks/useReportReview'
import { ReportStatusBanner } from '../components/ReportStatusBanner'
import { ReportAssessmentScores } from '../components/ReportAssessmentScores'
import { ReportMissionSelector } from '../components/ReportMissionSelector'

const ReportReviewPage = () => {
  const { sessionId, reportId } = useParams<{ sessionId: string; reportId: string }>()
  const navigate = useNavigate()

  const {
    report,
    session,
    participant,
    photo,
    stageInfos,
    missions,
    assignedMissionIds,
    narrativeText,
    setNarrativeText,
    loading,
    error,
    actionLoading,
    loadData,
    toggleMission,
    handleApprove,
    handleSend,
    handleCetak,
    handleDownloadPdf,
    handleDownloadPng,
  } = useReportReview(sessionId, reportId)

  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  const onApprove = async () => {
    const ok = await handleApprove()
    if (ok) setShowApproveConfirm(false)
  }

  const onSend = async () => {
    const ok = await handleSend()
    if (ok) setShowSendConfirm(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Memuat..."
          breadcrumbs={[
            { label: 'Laporan', href: ROUTES.ADMIN.REPORTS },
            {
              label: sessionId ? 'Session' : '',
              href: sessionId ? `/admin/reports/${sessionId}` : undefined,
            },
            { label: 'Review' },
          ].filter((b) => b.label)}
        />
        <div className="bg-surface rounded-2xl p-6 animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-surface-variant rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !report || !participant || !session) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Error"
          breadcrumbs={[{ label: 'Laporan', href: ROUTES.ADMIN.REPORTS }, { label: 'Review' }]}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => navigate(`/admin/reports/${sessionId}`)}>
            Kembali
          </Button>
        </div>
        <ErrorState message={error || 'Data tidak ditemukan.'} onRetry={loadData} />
      </div>
    )
  }

  const canApprove =
    report.status === ReportStatus.DRAFT || report.status === ReportStatus.PENDING_REVIEW
  const canSend = report.status === ReportStatus.APPROVED

  return (
    <div className="space-y-6">
      <PageHeader
        title={participant.child_name}
        subtitle="Review dan kelola laporan peserta"
        breadcrumbs={[
          { label: 'Laporan', href: ROUTES.ADMIN.REPORTS },
          { label: session.name, href: `/admin/reports/${sessionId}` },
          { label: participant.child_name },
        ]}
        className="no-print"
      />

      <ReportStatusBanner report={report} copiedLink={copiedLink} onCopyLink={handleCopyLink} />

      {report.status === ReportStatus.SENT && (
        <Card title="Ringkasan yang Dikirim" subtitle="Konten yang telah dikirim ke orang tua">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                Narasi
              </p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">{narrativeText || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                Misi Lanjutan
              </p>
              {assignedMissionIds.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Tidak ada misi dipilih</p>
              ) : (
                <ul className="text-sm text-on-surface space-y-1">
                  {missions
                    .filter((m) => assignedMissionIds.includes(m.id))
                    .map((m) => (
                      <li key={m.id} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{m.title_child}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {photo && (
              <div>
                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                  Foto
                </p>
                <img
                  src={
                    resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo') ??
                    (photo.framed_file_url || photo.original_file_url)
                  }
                  alt={participant.child_name}
                  className="w-24 h-24 object-cover rounded-xl"
                />
              </div>
            )}
            <p className="text-xs text-on-surface-variant">
              Waktu kirim: {report.sent_at ? formatDate(report.sent_at) : '-'}
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-6 print-report">
        <Card>
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-surface-variant flex items-center justify-center shrink-0 overflow-hidden">
              {photo ? (
                <img
                  src={
                    resolveStoredUpload(photo.framed_file_url || photo.original_file_url, 'photo') ??
                    (photo.framed_file_url || photo.original_file_url)
                  }
                  alt={participant.child_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <Camera className="w-8 h-8 text-on-surface-variant" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-on-surface">{participant.child_name}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Usia:</span>
                  <span className="text-on-surface font-medium">{participant.child_age} tahun</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Sekolah:</span>
                  <span className="text-on-surface font-medium">
                    {participant.school_name || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Orang Tua:</span>
                  <span className="text-on-surface font-medium">{participant.parent_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">Sesi:</span>
                  <span className="text-on-surface font-medium">{session.name}</span>
                </div>
              </div>

              {!photo && (
                <p className="mt-3 text-xs text-yellow-600 flex items-center gap-1.5 no-print">
                  <Camera className="w-3.5 h-3.5" />
                  {participant.consent_photo === false
                    ? 'Izin foto tidak diberikan — foto tidak tersedia'
                    : 'Belum ada foto yang dipilih untuk laporan'}
                </p>
              )}
            </div>
          </div>
        </Card>

        <ReportAssessmentScores stageInfos={stageInfos} />

        {report.status !== ReportStatus.SENT && (
          <Card title="Narasi AI" subtitle="Draft narasi yang akan dikirim ke orang tua">
            <textarea
              value={narrativeText}
              onChange={(e) => setNarrativeText(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-outline-variant bg-surface p-4 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none resize-y no-print"
              placeholder="Narasi akan muncul setelah laporan di-generate..."
            />
            <div className="print-report whitespace-pre-wrap p-4 hidden">{narrativeText}</div>
            <div className="flex items-center justify-between mt-2 no-print">
              <p className="text-xs text-on-surface-variant">
                Edit narasi sesuai kebutuhan sebelum menyetujui laporan.
              </p>
              <span className="text-xs text-on-surface-variant">
                {narrativeText.length} karakter
              </span>
            </div>
          </Card>
        )}

        {report.status !== ReportStatus.SENT && (
          <ReportMissionSelector
            missions={missions}
            assignedMissionIds={assignedMissionIds}
            onToggleMission={toggleMission}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-surface rounded-2xl p-4 border border-outline-variant sticky bottom-4 shadow-lg no-print">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/reports/${sessionId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
        </Button>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={handleCetak} disabled={!!actionLoading}>
          <Printer className="w-4 h-4 mr-1" /> Cetak
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={!!actionLoading}>
          {actionLoading === 'pdf' ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-1" /> Unduh PDF
            </>
          )}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownloadPng} disabled={!!actionLoading}>
          {actionLoading === 'png' ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-1" /> Unduh PNG
            </>
          )}
        </Button>
        {canApprove && (
          <Button
            size="sm"
            onClick={() => setShowApproveConfirm(true)}
            disabled={actionLoading === 'approve'}
          >
            {actionLoading === 'approve' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Memproses...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-1" /> Setujui
              </>
            )}
          </Button>
        )}
        {canSend && (
          <Button
            size="sm"
            onClick={() => setShowSendConfirm(true)}
            disabled={actionLoading === 'send'}
          >
            {actionLoading === 'send' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Mengirim...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1" /> Kirim ke Orang Tua
              </>
            )}
          </Button>
        )}
      </div>

      <Modal
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        title="Setujui Laporan"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowApproveConfirm(false)}>
              Batal
            </Button>
            <Button onClick={onApprove} disabled={actionLoading === 'approve'}>
              {actionLoading === 'approve' ? 'Memproses...' : 'Setujui'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Setelah disetujui, laporan akan siap dikirim ke orang tua/wali dari{' '}
          <strong>{participant.child_name}</strong>.
        </p>
      </Modal>

      <Modal
        open={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        title="Kirim Laporan ke Orang Tua"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSendConfirm(false)}>
              Batal
            </Button>
            <Button onClick={onSend} disabled={actionLoading === 'send'}>
              {actionLoading === 'send' ? 'Mengirim...' : 'Kirim'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Laporan akan dikirim ke orang tua/wali dari <strong>{participant.child_name}</strong>{' '}
          melalui tautan yang aman. Orang tua akan dapat melihat laporan lengkap beserta misi
          lanjutan.
        </p>
      </Modal>
    </div>
  )
}

export default ReportReviewPage
