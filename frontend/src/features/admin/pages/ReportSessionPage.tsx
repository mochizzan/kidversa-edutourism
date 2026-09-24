import { useState, useEffect, useMemo } from 'react'
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
  CheckCircle,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Modal } from '../../../shared/components/ui/Modal'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { ReportStatus } from '../../../core/types/enums'
import { cn } from '../../../core/utils'
import { formatDate } from '../../../shared/utils'
import {
  reportStatusBadge,
  reportStatusLabel,
  NO_ASSESSMENT_LABEL,
  NO_REPORT_LABEL,
} from '../../../core/constants/reportStatus'
import { useReportSession } from '../hooks/useReportSession'
import { CompactPagination } from '../../../shared/components/data/CompactPagination'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import type { Participant } from '../../../core/types'
import { useTranslation, Trans } from 'react-i18next'

const REPORT_PAGE_SIZE = DEFAULT_CLIENT_PAGE_SIZE

const ReportSessionPage = () => {
  const { t } = useTranslation()
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const {
    session,
    topics,
    activeTopicId,
    setActiveTopicId,
    reports,
    loading,
    error,
    search,
    setSearch,
    generating,
    sending,
    genError,
    filteredReports,
    approvedCount,
    loadData,
    handleGenerateAll,
    handleGenerateOne,
    handleSendAll,
  } = useReportSession(sessionId)

  // Per-Topic view: only rows for the active Topic are shown; summary cards
  // and bulk counts below are scoped to that Topic.
  const topicReports = reports.filter((r) => r.topicId === activeTopicId)
  const topicFilteredReports = filteredReports.filter((r) => r.topicId === activeTopicId)
  const topicApproved = topicReports.filter((r) => r.report?.status === ReportStatus.APPROVED).length
  const topicSent = topicReports.filter((r) => r.report?.status === ReportStatus.SENT).length
  const topicDraft = topicReports.filter((r) => r.report?.status === ReportStatus.DRAFT).length
  const topicAllFinalized =
    topicReports.length > 0 &&
    topicReports.every(
      (r) =>
        r.report &&
        (r.report.status === ReportStatus.APPROVED || r.report.status === ReportStatus.SENT),
    )
  const topicAllHaveReport = topicReports.length > 0 && topicReports.every((r) => r.report)

  const [generateResult, setGenerateResult] = useState<{
    generatedCount: number
    skippedParticipants: Participant[]
  } | null>(null)
  const [showConfirmSend, setShowConfirmSend] = useState(false)
  const [reportPage, setReportPage] = useState(1)

  useEffect(() => {
    setReportPage(1)
  }, [activeTopicId, search])

  const reportTotalPages = Math.max(1, Math.ceil(topicFilteredReports.length / REPORT_PAGE_SIZE))
  const safeReportPage = Math.min(reportPage, reportTotalPages)
  const pagedReports = useMemo(() => {
    const start = (safeReportPage - 1) * REPORT_PAGE_SIZE
    return topicFilteredReports.slice(start, start + REPORT_PAGE_SIZE)
  }, [topicFilteredReports, safeReportPage])

  const onGenerate = async () => {
    const result = await handleGenerateAll()
    if (result.generatedCount > 0 || result.skippedParticipants.length > 0) {
      setGenerateResult({
        generatedCount: result.generatedCount,
        skippedParticipants: result.skippedParticipants,
      })
    }
  }

  const onGenerateOne = (participantId: string) => {
    const item = reports.find((r) => r.participant?.id === participantId)
    if (item?.report || item?.status !== 'ready_to_generate') return
    handleGenerateOne(participantId)
  }

  const onSend = async () => {
    const ok = await handleSendAll()
    if (ok) setShowConfirmSend(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('common.loading')}
          breadcrumbs={[{ label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS }, { label: t('admin.common.detail') }]}
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
          title={t('admin.reports.errorTitle')}
          breadcrumbs={[{ label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS }, { label: t('admin.common.detail') }]}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => navigate(ROUTES.ADMIN.REPORTS)}>
            {t('common.back')}
          </Button>
        </div>
        <ErrorState message={error || t('admin.reports.sessionNotFound')} onRetry={loadData} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.name}
        subtitle={`${formatDate(session.session_date)} — ${session.location}`}
        breadcrumbs={[{ label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS }, { label: session.name }]}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.ADMIN.REPORTS)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.back')}
          </Button>
        }
      />

      {topics.length > 1 && (
        <div className="flex flex-wrap gap-2 no-print">
          {topics.map((t) => (
            <button
              key={t.programStageId}
              type="button"
              onClick={() => setActiveTopicId(t.programStageId)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${activeTopicId === t.programStageId
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-on-surface border-outline-variant hover:border-primary'
                }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            {t('admin.reports.totalParticipants')}
          </p>
          <p className="text-2xl font-bold text-on-surface mt-1">{topicReports.length}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            {t('admin.reportStatus.draft')}
          </p>
          <p className="text-2xl font-bold text-on-surface mt-1">{topicDraft}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            {t('admin.reportStatus.approved')}
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">{topicApproved}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-on-surface-variant font-medium uppercase tracking-wider">
            {t('admin.reportStatus.sent')}
          </p>
          <p className="text-2xl font-bold text-primary mt-1">{topicSent}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onGenerate}
          disabled={generating || topicAllFinalized || topicReports.length === 0}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('admin.reports.generating')}
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              {topicReports.length === 0
                ? t('admin.reports.generateAll')
                : topicAllHaveReport
                  ? t('admin.reports.generateAgain')
                  : t('admin.reports.generateAll')}
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowConfirmSend(true)}
          disabled={topicApproved === 0 || sending}
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('admin.reports.sending')}
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> {t('admin.reports.sendAllCount', { count: topicApproved })}
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
          placeholder={t('admin.reports.searchPlaceholder')}
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant bg-surface text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none"
        />
      </div>

      {topicFilteredReports.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title={search ? t('admin.reports.notFoundTitle') : t('admin.participants.emptyTitle')}
          description={
            search ? t('admin.reports.notFoundDesc') : t('admin.reports.emptyDesc2')
          }
        />
      ) : (
        <div className="grid gap-3">
          {pagedReports.map((item) => {
            const isClickable = item.status === 'has_report'
            const showGenerateBtn = item.status === 'ready_to_generate'
            const isIncomplete = item.status === 'incomplete'
            const isNoAssessment = item.status === 'no_assessment'

            const cardContent = (
              <div
                className={cn(
                  'rounded-2xl border p-4 transition-all duration-200',
                  isClickable
                    ? 'bg-surface border-outline-variant hover:shadow-md hover:border-primary-container cursor-pointer'
                    : 'bg-surface border-outline-variant/50',
                  (isIncomplete || isNoAssessment) && 'opacity-75',
                )}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                      isClickable
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-variant text-on-surface-variant',
                    )}
                  >
                    <User className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-on-surface truncate">
                        {item.participant.child_name}
                      </p>
                      {item.report && (
                        <Badge variant={reportStatusBadge[item.report.status]} size="sm">
                          {t(reportStatusLabel[item.report.status])}
                        </Badge>
                      )}
                      {showGenerateBtn && (
                        <Badge variant="success" size="sm">
                          {t('admin.reports.readyGenerate')}
                        </Badge>
                      )}
                      {isNoAssessment && (
                        <Tooltip content={t('admin.reports.noAssessmentTip')}>
                          <Badge variant="warning" size="sm">
                            {t(NO_ASSESSMENT_LABEL)}
                          </Badge>
                        </Tooltip>
                      )}
                      {isIncomplete && (
                        <Tooltip content={t('admin.reports.incompleteTip')}>
                          <Badge variant="neutral" size="sm">
                            {t(NO_REPORT_LABEL)}
                          </Badge>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-on-surface-variant mt-0.5">
                      {item.avgRating > 0 && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-accent fill-accent" />
                          {item.avgRating.toFixed(1)}
                        </span>
                      )}
                      {item.participant.school_name && (
                        <span>{item.participant.school_name}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {showGenerateBtn && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={generating || item.status !== 'ready_to_generate' || topicAllFinalized}
                        onClick={(e) => {
                          e?.preventDefault()
                          e?.stopPropagation()
                          onGenerateOne(item.participant.id)
                        }}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" /> {t('admin.reports.generate')}
                      </Button>
                    )}
                    {item.report?.status === ReportStatus.APPROVED && (
                      <span className="text-xs text-green-600 font-medium">{t('admin.reports.readySend')}</span>
                    )}
                    {isClickable && <ChevronRight className="w-4 h-4 text-on-surface-variant" />}
                  </div>
                </div>
              </div>
            )

            if (isClickable && item.report) {
              return (
                <Link
                  key={item.participant.id}
                  to={`/admin/reports/${sessionId}/review/${item.participant.id}`}
                  className="block"
                >
                  {cardContent}
                </Link>
              )
            }

            return (
              <div key={item.participant.id}>{cardContent}</div>
            )
          })}
        </div>
      )}

      <CompactPagination
        page={safeReportPage}
        totalPages={reportTotalPages}
        totalItems={topicFilteredReports.length}
        pageSize={REPORT_PAGE_SIZE}
        onPageChange={setReportPage}
        itemLabel={t('admin.reports.participantNoun')}
      />

      <Modal
        open={!!generateResult}
        onClose={() => setGenerateResult(null)}
        title={t('admin.reports.generateResultTitle')}
        size="md"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setGenerateResult(null)}>{t('admin.reports.understand')}</Button>
          </div>
        }
      >
        {generateResult && (
          <div className="space-y-3">
            {generateResult.generatedCount > 0 && (
              <div className="flex items-start gap-2 text-sm text-on-surface-variant">
                <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                <p>
                  <Trans
                    i18nKey="admin.reports.generateOk"
                    values={{ count: generateResult.generatedCount }}
                    components={{ strong: <strong /> }}
                  />
                </p>
              </div>
            )}
            {generateResult.skippedParticipants.length > 0 && (
              <>
                <div className="flex items-start gap-2 text-sm text-on-surface-variant">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <p>
                    <Trans
                      i18nKey="admin.reports.generateSkip"
                      components={{ strong: <strong /> }}
                    />
                  </p>
                </div>
                <ul className="space-y-2">
                  {generateResult.skippedParticipants.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-surface-variant text-sm"
                    >
                      <User className="w-4 h-4 text-on-surface-variant" />
                      <span className="font-medium text-on-surface">{p.child_name}</span>
                      <span className="text-on-surface-variant">({p.school_name || '-'})</span>
                      <Badge variant="warning" size="sm">
                        {t('common.assessment.rating0')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={showConfirmSend}
        onClose={() => setShowConfirmSend(false)}
        title={t('admin.reports.sendConfirmTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowConfirmSend(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSend} disabled={sending}>
              {sending ? t('admin.reports.sending') : t('admin.reports.sendCount', { count: topicApproved })}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <Send className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-on-surface-variant">
            <p>
              <Trans
                i18nKey="admin.reports.sendConfirmMsg"
                values={{ count: approvedCount }}
                components={{ strong: <strong /> }}
              />
            </p>
            <p className="mt-2">{t('admin.reports.sendConfirmNote')}</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ReportSessionPage
