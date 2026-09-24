import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import {
  ArrowLeft,
  Camera,
  Send,
  Sparkles,
  CheckCircle,
  Printer,
  Loader2,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { Modal } from '../../../shared/components/ui/Modal'
import { ReportStatus } from '../../../core/types/enums'
import { formatDate } from '../../../shared/utils'
import { getMediaUrl } from '../../../core/utils/media'
import { useReportReview } from '../hooks/useReportReview'
import { ReportStatusBanner } from '../components/ReportStatusBanner'
import { ReportAssessmentScores } from '../components/ReportAssessmentScores'
import { ReportMissionSelector } from '../components/ReportMissionSelector'
import { BadgeList } from '../../../shared/components/data/BadgeList'
import { Tooltip } from '../../../shared/components/ui/Tooltip'
import { useTranslation, Trans } from 'react-i18next'

const ReportReviewPage = () => {
  const { t } = useTranslation()
  const { sessionId, participantId } = useParams<{ sessionId: string; participantId: string }>()
  const navigate = useNavigate()

  const {
    report,
    topics,
    activeTopicId,
    setActiveTopicId,
    loadTopicMissions,
    suggesting,
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
    handleSuggestMissions,
    handleApprove,
    handleSend,
    handleCetak,
    handleDownloadPdf,
    handleDownloadPng,
    hasNoAssessment,
    streaming,
    handleGenerateNarrative,
    groupCompleted,
  } = useReportReview(sessionId, participantId)

  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showSendConfirm, setShowSendConfirm] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
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

  const onGenerate = async () => {
    const force = narrativeText.trim().length > 0
    setShowGenerateConfirm(false)
    await handleGenerateNarrative(force)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('common.loading')}
          breadcrumbs={[
            { label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS },
            {
              label: sessionId ? t('admin.review.crumbSession') : '',
              href: sessionId ? `/admin/reports/${sessionId}` : undefined,
            },
            { label: t('admin.review.crumbReview') },
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
          title={t('admin.reports.errorTitle')}
          breadcrumbs={[{ label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS }, { label: t('admin.review.crumbReview') }]}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => navigate(`/admin/reports/${sessionId}`)}>
            {t('common.back')}
          </Button>
        </div>
        <ErrorState message={error || t('admin.reports.dataNotFound')} onRetry={loadData} />
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
        subtitle={t('admin.review.subtitle')}
        breadcrumbs={[
          { label: t('admin.reports.title'), href: ROUTES.ADMIN.REPORTS },
          { label: session.name, href: `/admin/reports/${sessionId}` },
          { label: participant.child_name },
        ]}
        className="no-print"
      />

      <ReportStatusBanner report={report} copiedLink={copiedLink} onCopyLink={handleCopyLink} />

      {topics.length > 1 && (
        <div className="flex flex-wrap gap-2 no-print">
          {topics.map((topic) => (
            <button
              key={topic.programStageId}
              type="button"
              onClick={() => {
                setActiveTopicId(topic.programStageId)
                void loadTopicMissions(topic.programStageId)
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${activeTopicId === topic.programStageId
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-on-surface border-outline-variant hover:border-primary'
                }`}
            >
              {topic.name}
            </button>
          ))}
        </div>
      )}

      {hasNoAssessment && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-sm flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">{t('admin.review.noAssessmentTitle')}</p>
            <p className="text-yellow-700 mt-1">{t('admin.review.noAssessmentDesc')}</p>
          </div>
        </div>
      )}

      {report.status === ReportStatus.SENT && (
        <Card title={t('admin.review.sentSummaryTitle')} subtitle={t('admin.review.sentSummarySubtitle')}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                {t('admin.review.narrativeLabel')}
              </p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">{narrativeText || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                {t('admin.review.missionLabel')}
              </p>
              {assignedMissionIds.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{t('admin.review.noMission')}</p>
              ) : (
                <ul className="text-sm text-on-surface space-y-1">
                  {missions
                    .filter((m) => assignedMissionIds.includes(m.id))
                    .map((m) => (
                      <li key={m.id} className="flex items-start gap-2">
                        <span>•</span>
                        <span>{m.title}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {photo && (
              <div>
                <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1">
                  {t('admin.review.photoLabel')}
                </p>
                <img
                  src={getMediaUrl('photo', photo.id)}
                  alt={participant.child_name}
                  className="w-24 h-24 object-cover rounded-xl"
                />
              </div>
            )}
            <p className="text-xs text-on-surface-variant">
              {t('admin.review.sentAt', { date: report.sent_at ? formatDate(report.sent_at) : '-' })}
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
                  src={getMediaUrl('photo', photo.id)}
                  alt={participant.child_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    ; (e.target as HTMLImageElement).style.display = 'none'
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
                  <span className="text-on-surface-variant">{t('admin.review.ageLabel')}</span>
                  <span className="text-on-surface font-medium">
                    {t('admin.review.ageYears', { age: participant.child_age })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">{t('admin.review.schoolLabel')}</span>
                  <span className="text-on-surface font-medium">
                    {participant.school_name || '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">{t('admin.review.parentLabel')}</span>
                  <span className="text-on-surface font-medium">{participant.parent_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-on-surface-variant">{t('admin.review.sessionLabel')}</span>
                  <span className="text-on-surface font-medium">{session.name}</span>
                </div>
              </div>

              {!photo && (
                <p className="mt-3 text-xs text-yellow-600 flex items-center gap-1.5 no-print">
                  <Camera className="w-3.5 h-3.5" />
                  {participant.consent_photo === false
                    ? t('admin.review.noPhotoConsent')
                    : t('admin.review.noPhotoPicked')}
                </p>
              )}
            </div>
          </div>
        </Card>

        <BadgeList participantId={report.participant_id} />

        <ReportAssessmentScores stageInfos={stageInfos} />

        {report.status !== ReportStatus.SENT && !hasNoAssessment && (
          <Card title={t('admin.review.narrativeTitle')} subtitle={t('admin.review.narrativeSubtitle')}>
            <textarea
              value={narrativeText}
              onChange={(e) => setNarrativeText(e.target.value)}
              rows={6}
              readOnly={streaming}
              className={`w-full rounded-xl border border-outline-variant bg-surface p-4 text-sm placeholder:text-on-surface-variant focus:border-primary focus:ring-2 focus:ring-primary-container focus:outline-none resize-y no-print ${streaming ? 'opacity-60' : ''}`}
              placeholder={t('admin.review.narrativePlaceholder')}
            />
            <div className="print-report whitespace-pre-wrap p-4 hidden">{narrativeText}</div>
            <div className="flex items-center justify-between mt-2 no-print">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowGenerateConfirm(true)}
                disabled={hasNoAssessment || streaming || actionLoading !== null}
              >
                {streaming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('admin.review.building')}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-1" /> {t('admin.review.generateNarrative')}
                  </>
                )}
              </Button>
              <p className="text-xs text-on-surface-variant">{t('admin.review.editHint')}</p>
              <span className="text-xs text-on-surface-variant">
                {t('admin.review.charCount', { count: narrativeText.length })}
                {streaming ? t('admin.review.typing') : ''}
              </span>
            </div>
          </Card>
        )}

        {report.status !== ReportStatus.SENT && !hasNoAssessment && (
          <ReportMissionSelector
            missions={missions}
            assignedMissionIds={assignedMissionIds}
            onToggleMission={toggleMission}
            onSuggestMissions={handleSuggestMissions}
            suggesting={suggesting}
          />
        )}
      </div>

      {!hasNoAssessment && (
        <div className="flex flex-wrap items-center gap-3 bg-surface rounded-2xl p-4 border border-outline-variant sticky bottom-4 shadow-lg no-print">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/reports/${sessionId}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.back')}
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={handleCetak} disabled={!!actionLoading}>
            <Printer className="w-4 h-4 mr-1" /> {t('admin.review.print')}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={!!actionLoading}>
            {actionLoading === 'pdf' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.processing')}
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-1" /> {t('admin.review.downloadPdf')}
              </>
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPng} disabled={!!actionLoading}>
            {actionLoading === 'png' ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.processing')}
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 mr-1" /> {t('admin.review.downloadPng')}
              </>
            )}
          </Button>
          {canApprove && (
            <Tooltip content={!groupCompleted ? t('admin.review.groupNotCompleted') : ''}>
              <Button
                size="sm"
                onClick={() => setShowApproveConfirm(true)}
                disabled={actionLoading === 'approve' || !groupCompleted}
              >
                {actionLoading === 'approve' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('common.processing')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-1" /> {t('admin.common.approve')}
                  </>
                )}
              </Button>
            </Tooltip>
          )}
          {canSend && (
            <Button
              size="sm"
              onClick={() => setShowSendConfirm(true)}
              disabled={actionLoading === 'send'}
            >
              {actionLoading === 'send' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> {t('admin.reports.sending')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-1" /> {t('admin.review.sendToParent')}
                </>
              )}
            </Button>
          )}
        </div>
      )}

      <Modal
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        title={t('admin.review.approveTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowApproveConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onApprove} disabled={actionLoading === 'approve' || !groupCompleted}>
              {actionLoading === 'approve' ? t('common.processing') : t('admin.common.approve')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          <Trans
            i18nKey="admin.review.approveMsg"
            values={{ name: participant.child_name }}
            components={{ strong: <strong /> }}
          />
        </p>
      </Modal>

      <Modal
        open={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        title={t('admin.review.sendTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowSendConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onSend} disabled={actionLoading === 'send'}>
              {actionLoading === 'send' ? t('admin.reports.sending') : t('admin.review.sendBtn')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          <Trans
            i18nKey="admin.review.sendMsg"
            values={{ name: participant.child_name }}
            components={{ strong: <strong /> }}
          />
        </p>
      </Modal>

      <Modal
        open={showGenerateConfirm}
        onClose={() => setShowGenerateConfirm(false)}
        title={t('admin.review.generateNarrative')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowGenerateConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onGenerate} disabled={streaming || actionLoading !== null}>
              {t('admin.review.generateNarrativeBtn')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">{t('admin.review.generateConfirmMsg')}</p>
      </Modal>
    </div>
  )
}

export default ReportReviewPage
