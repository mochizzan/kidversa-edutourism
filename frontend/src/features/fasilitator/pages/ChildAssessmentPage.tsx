import { useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, ShieldCheck, ShieldX } from 'lucide-react'
import { ROUTES } from '../../../core/constants/app'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { friendlyError } from '../../../core/utils/errorMessages'
import { useChildAssessment } from '../hooks/useChildAssessment'
import { KegiatanCard } from '../components/KegiatanCard'
import { assessmentService } from '../../../core/services/assessments'
import { SessionStatus } from '../../../core/types/enums'
import { groupCompletedErrorMessage } from '../utils/groupCompletedLock'
import { isKegiatanCompletedFromProgress } from '../utils/groupCompletion'
import type { CreateAssessmentDTO } from '../../../core/types'

const ChildAssessmentPage = () => {
  const { t } = useTranslation()
  const { groupId, childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const locationState = location.state as { sessionId?: string; sessionStageId?: string } | null
  const sessionId = locationState?.sessionId
  // Perbaikan-1: the ACTIVE topic arrives from GroupPage via BOTH the
  // `?stage=<sessionStageId>` query and location.state.sessionStageId
  // (handleAssess writes both). Query wins when both exist (shareable URL);
  // otherwise state; otherwise undefined → the hook falls back to the
  // historical chain. This id is a fetch dep: changing topic re-resolves
  // leaves + filters scores, so topik-2 never shows topik-1's leaves/scores.
  const stageId = searchParams.get('stage') ?? locationState?.sessionStageId ?? undefined

  const {
    loading,
    error,
    childDetail,
    assessmentMap,
    refreshAssessments,
    isMine,
    fetchData,
    isPresent,
  } = useChildAssessment(childId, sessionId, stageId)

  const [savingAny, setSavingAny] = useState(false)
  const { addToast } = useGlobalToast()

  // Completion is terminal: once the group row is COMPLETED, grading is locked
  // (the server rejects with group_completed as well). Read-only rendering —
  // the session-inactive pattern keeps data visible, controls get disabled.
  const isGroupCompleted = childDetail?.group?.status === 'COMPLETED'

  // Perbaikan-1 per-Kegiatan lock: a single Kegiatan card is locked when the
  // whole group is terminal OR its own leaf has a terminal (COMPLETED/SKIPPED)
  // progress row. A completed topik-1 leaf stays read-only while topik-2
  // leaves stay editable. Forms are never hidden — controls get disabled.
  const isKegiatanLocked = useCallback(
    (kegiatanId: string): boolean => {
      if (isGroupCompleted) return true
      const rows = childDetail?.groupProgressRows ?? []
      return isKegiatanCompletedFromProgress(rows, kegiatanId)
    },
    [isGroupCompleted, childDetail],
  )

  const handleSaveForKegiatan = useCallback(
    (kegiatan: { id: string; session_id: string }) => {
      return async (data: CreateAssessmentDTO) => {
        // Guard BOTH the whole-group and the per-Kegiatan terminal state with
        // the canonical message (local guard mirrors the server rejection).
        if (isKegiatanLocked(kegiatan.id)) {
          addToast({
            type: 'error',
            message: groupCompletedErrorMessage(),
          })
          return
        }
        setSavingAny(true)
        try {
          await assessmentService.upsert(data)
          await refreshAssessments()
        } catch (err) {
          // KegiatanCard's catch only logs — the user needs the failure here.
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setSavingAny(false)
        }
      }
    },
    [refreshAssessments, addToast, isKegiatanLocked],
  )

  const handleBack = () => {
    // Echo the active topic back so GroupPage restores the SAME topic instead
    // of re-resolving to current_session_stage_id (topik-1/topik-2 bug fix).
    const target = stageId
      ? `/fasilitator/groups/${groupId}?stage=${encodeURIComponent(stageId)}`
      : `/fasilitator/groups/${groupId}`
    navigate(target, stageId ? { state: { sessionStageId: stageId } } : undefined)
  }

  const { participant } = childDetail ?? {}
  const isSessionActive = childDetail?.session.status === SessionStatus.ACTIVE
  const hasConsentPhoto = participant?.consent_photo ?? false
  // Active topic display name (backend program-stage name, not an i18n key).
  const topicName = childDetail?.programStage?.name ?? t('fasilitator.topicFallback')

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-container-high rounded w-48 animate-pulse mb-4" />
        <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-surface-container-high animate-pulse" />
            <div className="flex-1">
              <div className="h-5 bg-surface-container-high rounded w-1/3 mb-2 animate-pulse" />
              <div className="h-4 bg-surface-container-high rounded w-1/4 animate-pulse" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-16 bg-surface-container-high rounded animate-pulse" />
            <div className="h-24 bg-surface-container-high rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (error && !childDetail) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.assessment.pageTitle')} />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty / not found state ──
  if (!childDetail || !participant) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('fasilitator.assessment.pageTitle')} />
        <ErrorState message={t('fasilitator.assessment.childNotFound')} onRetry={fetchData} />
      </div>
    )
  }

  // ── Session not active state ──
  if (!isSessionActive) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('fasilitator.assessment.pageTitle')}
          breadcrumbs={[
            { label: t('common.dashboard'), href: ROUTES.FASILITATOR.DASHBOARD },
            { label: participant.child_name },
          ]}
        />
        <ErrorState
          message={t('fasilitator.assessment.sessionNotStarted')}
          onRetry={fetchData}
        />
        <div className="flex sm:justify-start">
          <Button variant="secondary" onClick={handleBack} className="w-full sm:w-auto">
            {t('fasilitator.assessment.backToGroup')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fasilitator.assessment.pageTitle')}
        subtitle={topicName}
        breadcrumbs={[
          { label: t('common.dashboard'), href: ROUTES.FASILITATOR.DASHBOARD },
          { label: participant.child_name },
        ]}
      />

      {/* Child Info Card */}
      <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xl shrink-0">
            {participant.child_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              {participant.child_name}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {t('fasilitator.child.years', { age: participant.child_age })}
              {participant.school_name ? ` - ${participant.school_name}` : ''}
            </p>
          </div>
        </div>

        {!isMine && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <ShieldX className="w-4 h-4 shrink-0" />
            {t('fasilitator.assessment.readOnlyAssess')}
          </div>
        )}

        {/* Consent status */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            {hasConsentPhoto ? (
              <span className="flex items-center gap-1 text-green-600">
                <ShieldCheck className="w-3.5 h-3.5" /> {t('fasilitator.assessment.consentPhoto')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow-600">
                <ShieldX className="w-3.5 h-3.5" /> {t('fasilitator.assessment.noConsentPhoto')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Attendance status banner.
          OPSI B: attendance is SESSION-scoped (one whole-session row, toggled
          once on GroupPage) — this page only reads it as the grading gate
          (hadir prasyarat nilai). The banner text stays session-wide. */}
      {!isPresent && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          {t('fasilitator.assessment.absentBanner')}
        </div>
      )}

      {/* Kegiatan Cards — resolved from the ACTIVE topic only (stageId dep in
          the hook); scores filtered to those leaves, so topik-1 vs topik-2
          never share cards or values. */}
      {isPresent ? (
        childDetail.sessionSubstages.length > 0 ? (
          <div className="space-y-4">
            {childDetail.sessionSubstages.map((kegiatan, idx) => (
              <KegiatanCard
                key={kegiatan.id}
                kegiatan={kegiatan}
                assessment={assessmentMap.get(kegiatan.id)}
                kegiatanName={
                  childDetail.programSubstageNameMap[kegiatan.program_substage_id] ??
                  t('fasilitator.assessment.fallbackKegiatan', { n: idx + 1 })
                }
                participantId={participant.id}
                isMine={isMine}
                locked={isKegiatanLocked(kegiatan.id)}
                onSave={handleSaveForKegiatan(kegiatan)}
                isSavingGlobal={savingAny}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50 text-center">
            <p className="text-sm text-on-surface-variant">
              {t('fasilitator.assessment.emptyKegiatan')}
            </p>
          </div>
        )
      ) : null}

      {/* Quick Actions */}
      <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
        <h3 className="text-sm font-semibold text-on-surface mb-4">{t('fasilitator.assessment.quickActions')}</h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            {hasConsentPhoto && isMine ? (
              <button
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-container text-on-primary-container font-medium text-sm hover:bg-primary-container/80 transition-colors"
                onClick={() =>
                  navigate(
                    `/fasilitator/groups/${groupId}/children/${childId}/photo`,
                  )
                }
              >
                <Camera className="w-5 h-5" />
                {t('fasilitator.takePhoto')}
              </button>
            ) : (
              <div className="w-full px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-center gap-2">
                <ShieldX className="w-4 h-4 shrink-0" />
                <span>{t('fasilitator.assessment.noConsentMsg')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="flex sm:justify-start">
        <Button variant="secondary" onClick={handleBack} className="w-full sm:w-auto">
          {t('fasilitator.assessment.backToGroup')}
        </Button>
      </div>
    </div>
  )
}

export default ChildAssessmentPage
