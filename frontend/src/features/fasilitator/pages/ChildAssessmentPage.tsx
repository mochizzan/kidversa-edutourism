import { useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Camera, ShieldCheck, ShieldX } from 'lucide-react'
import { ROUTES } from '../../../core/constants/app'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { ErrorState } from '../../../shared/components/feedback/ErrorState'
import { useChildAssessment } from '../hooks/useChildAssessment'
import { KegiatanCard } from '../components/KegiatanCard'
import { assessmentService } from '../../../core/services/assessments'
import { SessionStatus } from '../../../core/types/enums'
import type { CreateAssessmentDTO } from '../../../core/types'

const ChildAssessmentPage = () => {
  const { groupId, childId } = useParams<{ groupId: string; childId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = (location.state as { sessionId?: string } | null)?.sessionId

  const {
    loading,
    error,
    childDetail,
    assessmentMap,
    refreshAssessments,
    isMine,
    fetchData,
    isPresent,
  } = useChildAssessment(childId, sessionId)

  const [savingAny, setSavingAny] = useState(false)

  const handleSaveForKegiatan = useCallback(
    (_kegiatan: { id: string; session_id: string }) => {
      return async (data: CreateAssessmentDTO) => {
        setSavingAny(true)
        try {
          await assessmentService.upsert(data)
          await refreshAssessments()
        } finally {
          setSavingAny(false)
        }
      }
    },
    [refreshAssessments],
  )

  const handleBack = () => {
    navigate(`/fasilitator/groups/${groupId}`)
  }

  const { participant } = childDetail ?? {}
  const isSessionActive = childDetail?.session.status === SessionStatus.ACTIVE
  const hasConsentPhoto = participant?.consent_photo ?? false

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
        <PageHeader title="Penilaian Anak" />
        <ErrorState message={error} onRetry={fetchData} />
      </div>
    )
  }

  // ── Empty / not found state ──
  if (!childDetail || !participant) {
    return (
      <div className="space-y-6">
        <PageHeader title="Penilaian Anak" />
        <ErrorState message="Data anak tidak ditemukan" onRetry={fetchData} />
      </div>
    )
  }

  // ── Session not active state ──
  if (!isSessionActive) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Penilaian Anak"
          breadcrumbs={[
            { label: 'Dashboard', href: ROUTES.FASILITATOR.DASHBOARD },
            { label: participant.child_name },
          ]}
        />
        <ErrorState
          message="Sesi belum dimulai. Penilaian tidak dapat dilakukan."
          onRetry={fetchData}
        />
        <div className="flex sm:justify-start">
          <Button variant="secondary" onClick={handleBack} className="w-full sm:w-auto">
            Kembali ke Kelompok
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Penilaian Anak"
        breadcrumbs={[
          { label: 'Dashboard', href: ROUTES.FASILITATOR.DASHBOARD },
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
              {participant.child_age} tahun
              {participant.school_name ? ` - ${participant.school_name}` : ''}
            </p>
          </div>
        </div>

        {!isMine && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            <ShieldX className="w-4 h-4 shrink-0" />
            Bukan kelompok Anda — penilaian hanya dapat dilihat (mode baca saja).
          </div>
        )}

        {/* Consent status */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            {hasConsentPhoto ? (
              <span className="flex items-center gap-1 text-green-600">
                <ShieldCheck className="w-3.5 h-3.5" /> Izin Foto
              </span>
            ) : (
              <span className="flex items-center gap-1 text-yellow-600">
                <ShieldX className="w-3.5 h-3.5" /> Tidak Ada Izin Foto
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Attendance status banner */}
      {!isPresent && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          Anak ini tidak hadir di sesi ini. Penilaian tidak dapat dilakukan.
        </div>
      )}

      {/* Kegiatan Cards */}
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
                  `Kegiatan ${idx + 1}`
                }
                participantId={participant.id}
                isMine={isMine}
                onSave={handleSaveForKegiatan(kegiatan)}
                isSavingGlobal={savingAny}
              />
            ))}
          </div>
        ) : (
          <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50 text-center">
            <p className="text-sm text-on-surface-variant">
              Belum ada kegiatan untuk dinilai.
            </p>
          </div>
        )
      ) : null}

      {/* Quick Actions */}
      <div className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50">
        <h3 className="text-sm font-semibold text-on-surface mb-4">Aksi Cepat</h3>
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
                Ambil Foto
              </button>
            ) : (
              <div className="w-full px-4 py-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm flex items-center gap-2">
                <ShieldX className="w-4 h-4 shrink-0" />
                <span>Tidak ada izin foto</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Back button */}
      <div className="flex sm:justify-start">
        <Button variant="secondary" onClick={handleBack} className="w-full sm:w-auto">
          Kembali ke Kelompok
        </Button>
      </div>
    </div>
  )
}

export default ChildAssessmentPage
