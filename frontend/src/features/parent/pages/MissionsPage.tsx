import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Target,
  CheckCircle,
  Circle,
  Loader2,
  AlertTriangle,
  Home,
  Users,
  School,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Card } from '../../../shared/components/ui/Card'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import {
  ParentTokenGuard,
  useParentToken,
} from '../../../shared/components/auth/ParentTokenGuard'
import { missionService } from '../../../core/services/missions'
import { participantMissionService } from '../../../core/services/missions'
import type { MissionBank, ParticipantMission } from '../../../core/types'
import { MissionCategory } from '../../../core/types/enums'
import { cn } from '../../../core/utils/cn'

/* ── Category config ── */
const missionCategories = [
  {
    key: MissionCategory.HOME,
    icon: Home,
    label: 'Di Rumah',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    key: MissionCategory.PARENT,
    icon: Users,
    label: 'Bersama Orang Tua',
    color: 'bg-purple-100 text-purple-700',
  },
  {
    key: MissionCategory.SCHOOL,
    icon: School,
    label: 'Di Sekolah',
    color: 'bg-green-100 text-green-700',
  },
]

/* ── Inner component ── */
function MissionsView() {
  const { report, loading: guardLoading, error: guardError } = useParentToken()
  const [searchParams] = useSearchParams()
  const reportIdParam = searchParams.get('reportId') || report?.id || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [participantMissions, setParticipantMissions] = useState<ParticipantMission[]>([])
  const [missionBank, setMissionBank] = useState<Map<string, MissionBank>>(new Map())
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const loadData = async () => {
    if (!reportIdParam) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const missions = await participantMissionService.getByReport(reportIdParam)
      setParticipantMissions(missions)

      // Load mission bank details
      const bankIds = [...new Set(missions.map((pm) => pm.mission_bank_id))]
      const bankMap = new Map<string, MissionBank>()

      const result = await missionService.getAll({ limit: 50 })
      for (const m of result.data) {
        if (bankIds.includes(m.id)) {
          bankMap.set(m.id, m)
        }
      }
      setMissionBank(bankMap)
    } catch {
      setError('Gagal memuat misi. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [reportIdParam])

  const handleToggle = async (pmId: string) => {
    setTogglingId(pmId)
    try {
      await participantMissionService.toggleComplete(pmId)
      await loadData()
    } catch {
      setError('Gagal memperbarui status misi.')
    } finally {
      setTogglingId(null)
    }
  }

  /* ── Compute progress and grouped missions ── */
  const completedCount = participantMissions.filter((pm) => pm.is_completed).length
  const totalCount = participantMissions.length

  const groupedMissions = missionCategories
    .map((cat) => {
      const missions = participantMissions
        .map((pm) => ({
          pm,
          bank: missionBank.get(pm.mission_bank_id),
        }))
        .filter((item) => item.bank?.category === cat.key)

      // Sort: incomplete first, then completed
      missions.sort((a, b) => {
        if (a.pm.is_completed === b.pm.is_completed) return 0
        return a.pm.is_completed ? 1 : -1
      })

      return { ...cat, missions }
    })
    .filter((g) => g.missions.length > 0)

  /* ── Guard loading ── */
  if (guardLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-on-surface-variant">Memuat misi...</p>
        </div>
      </div>
    )
  }

  /* ── Invalid guard ── */
  if (guardError || !report) {
    return (
      <EmptyState
        icon={<Target className="w-12 h-12" />}
        title="Tidak dapat mengakses"
        description="Tautan tidak valid atau sudah kedaluwarsa."
      />
    )
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-on-surface">Misi Lanjutan</h1>
          <p className="text-sm text-on-surface-variant mt-1">Ananda</p>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface rounded-2xl p-4 animate-pulse">
            <div className="h-5 bg-surface-variant rounded w-32 mb-3" />
            <div className="h-14 bg-surface-variant rounded mb-2" />
            <div className="h-14 bg-surface-variant rounded" />
          </div>
        ))}
      </div>
    )
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="w-8 h-8 text-error mx-auto mb-3" />
        <p className="text-sm text-on-surface-variant mb-4">{error}</p>
        <Button variant="secondary" size="sm" onClick={loadData}>
          Coba Lagi
        </Button>
      </div>
    )
  }

  /* ── No missions ── */
  if (participantMissions.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-on-surface">Misi Lanjutan</h1>
          <p className="text-sm text-on-surface-variant mt-1">Ananda</p>
        </div>
        <EmptyState
          icon={<Target className="w-12 h-12" />}
          title="Belum ada misi"
          description="Misi lanjutan akan muncul setelah laporan tersedia."
        />
      </div>
    )
  }

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-on-surface">Misi Lanjutan</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Untuk: Ananda
        </p>
      </div>

      {/* Progress */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-on-surface">
              {completedCount}/{totalCount} misi selesai
            </p>
            <div className="mt-2 w-full bg-surface-variant rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{
                  width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Mission groups by category */}
      {groupedMissions.map((group) => {
        const Icon = group.icon
        return (
          <div key={group.key}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', group.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <h2 className="font-semibold text-on-surface">{group.label}</h2>
              <span className="text-xs text-on-surface-variant ml-auto">
                {group.missions.filter((m) => m.pm.is_completed).length}/{group.missions.length}
              </span>
            </div>

            <div className="space-y-2">
              {group.missions.map(({ pm, bank }) => (
                <div
                  key={pm.id}
                  className={cn(
                    'bg-surface rounded-xl border p-4 transition-all duration-200',
                    pm.is_completed
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-outline-variant hover:border-primary-container'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggle(pm.id)}
                      disabled={togglingId === pm.id}
                      className="mt-0.5 shrink-0"
                      aria-label={pm.is_completed ? 'Tandai belum selesai' : 'Tandai selesai'}
                    >
                      {togglingId === pm.id ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : pm.is_completed ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-on-surface-variant hover:text-primary transition-colors" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          pm.is_completed
                            ? 'text-green-700 line-through'
                            : 'text-on-surface'
                        )}
                      >
                        {bank?.title_child || 'Misi'}
                      </p>
                      {bank?.description_parent && (
                        <p className="text-xs text-on-surface-variant mt-1">
                          {bank.description_parent}
                        </p>
                      )}
                      {pm.completed_at && (
                        <p className="text-[11px] text-green-500 mt-1">
                          Selesai{' '}
                          {new Date(pm.completed_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Back to report */}
      {report && (
        <Link
          to={`/parent/report?${searchParams.toString()}`}
          className="flex items-center justify-center gap-2 text-sm text-primary font-medium hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Laporan
        </Link>
      )}
    </div>
  )
}

/* ── Page wrapper ── */
const MissionsPage = () => {
  return (
    <ParentTokenGuard>
      <MissionsView />
    </ParentTokenGuard>
  )
}

export default MissionsPage
