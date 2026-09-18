import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Plus, Pencil, FolderOpen, ImageOff } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Card } from '../../../shared/components/ui/Card'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { programService } from '../../../core/services/programs'
import { programSubstageService } from '../../../core/services/program-substages'
import { topicListPath, topicEditPath, activityNewPath } from '../../../core/constants/app'
import { getMediaUrl } from '../../../core/utils/media'
import { friendlyError } from '../../../core/utils/errorMessages'
import type { Program, ProgramStage, ProgramSubstage } from '../../../core/types'

interface TopicDetailState {
  showAddActivityCta?: boolean
}

const TopicDetailPage = () => {
  const { topicId } = useParams<{ topicId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { addToast } = useGlobalToast()
  const state = (location.state as TopicDetailState | null) || {}

  const [program, setProgram] = useState<Program | null>(null)
  const [stage, setStage] = useState<ProgramStage | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'detail' | 'kegiatan'>('detail')
  const [kegiatan, setKegiatan] = useState<ProgramSubstage[]>([])
  const [kegiatanLoading, setKegiatanLoading] = useState(false)
  const [showCta, setShowCta] = useState(state.showAddActivityCta ?? false)

  useEffect(() => {
    if (!topicId) return
    setLoading(true)
      ; (async () => {
        try {
          const res = await programService.getAll({ limit: 1000 })
          for (const program of res.data) {
            const stages = await programService.getStages(program.id)
            const found = stages.find((s) => s.id === topicId)
            if (found) {
              setProgram(program)
              setStage(found)
              break
            }
          }
        } catch (err) {
          addToast({ type: 'error', message: friendlyError(err) })
        } finally {
          setLoading(false)
        }
      })()
  }, [topicId, addToast])

  useEffect(() => {
    if (!topicId || activeTab !== 'kegiatan') return
    setKegiatanLoading(true)
    programSubstageService
      .listByStage(topicId)
      .then((list) => setKegiatan(list))
      .catch((err) => {
        addToast({ type: 'error', message: friendlyError(err) })
        setKegiatan([])
      })
      .finally(() => setKegiatanLoading(false))
  }, [topicId, activeTab, addToast])

  const activityPath = useMemo(() => {
    if (!program || !stage) return activityNewPath()
    return activityNewPath({ programId: program.id, stageId: stage.id })
  }, [program, stage])

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>
  if (!program || !stage) {
    return (
      <div className="text-center text-on-surface-variant py-12">
        Topik tidak ditemukan
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate(topicListPath())}>
            Kembali ke Daftar Topik
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={stage.name}
        subtitle={`Program: ${program.name}`}
        breadcrumbs={[
          { label: 'Topik', href: topicListPath() },
          { label: stage.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={<Pencil className="w-4 h-4" />}
              onClick={() => navigate(topicEditPath(stage.id), { state: { programId: program.id } })}
            >
              Edit Topik
            </Button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { key: 'detail', label: 'Detail' },
          { key: 'kegiatan', label: `Kegiatan (${kegiatan.length})` },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'detail' | 'kegiatan')}
      />

      {activeTab === 'detail' && (
        <Card>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Program
              </p>
              <p className="text-sm text-on-surface">{program.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Nama Topik
              </p>
              <p className="text-sm text-on-surface">{stage.name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                Deskripsi
              </p>
              <p className="text-sm text-on-surface">{stage.description || '-'}</p>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Foto Stage
                </p>
                <Badge variant={stage.is_photo_stage ? 'success' : 'neutral'}>
                  {stage.is_photo_stage ? 'Ya' : 'Tidak'}
                </Badge>
              </div>
            </div>

            <div className="border-t border-outline-variant/50 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-2">
                Badge Topik
              </p>
              {stage.badge_name ? (
                <div className="flex items-center gap-3">
                  {stage.badge_image_url ? (
                    <img
                      src={getMediaUrl('content', stage.badge_image_url)}
                      alt={stage.badge_name}
                      className="w-12 h-12 rounded-xl object-cover border border-outline-variant"
                      onError={(e) => {
                        ; (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-variant flex items-center justify-center">
                      <ImageOff className="w-5 h-5 text-on-surface-variant" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-on-surface">{stage.badge_name}</p>
                    {stage.badge_image_url && (
                      <p className="text-xs text-on-surface-variant break-all">{stage.badge_image_url}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Badge belum diatur</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'kegiatan' && (
        <Card
          title="Daftar Kegiatan"
          actions={
            <Button
              icon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setShowCta(false)
                navigate(activityPath)
              }}
            >
              Tambah Kegiatan
            </Button>
          }
        >
          {showCta && (
            <div className="mb-4 p-3 rounded-xl bg-primary-container text-on-primary-container text-sm flex items-center justify-between gap-3">
              <span>Topik berhasil dibuat. Tambahkan kegiatan pertama sekarang?</span>
              <Button size="sm" onClick={() => navigate(activityPath)}>
                Tambah Kegiatan
              </Button>
            </div>
          )}

          {kegiatanLoading ? (
            <p className="text-sm text-on-surface-variant py-4">Memuat kegiatan…</p>
          ) : kegiatan.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="w-10 h-10" />}
              title="Belum ada kegiatan"
              description="Tambahkan kegiatan untuk topik ini."
              action={{
                label: 'Tambah Kegiatan',
                onClick: () => navigate(activityPath),
              }}
            />
          ) : (
            <ol className="divide-y divide-outline-variant/50">
              {kegiatan.map((item) => (
                <li key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">
                        {item.sequence_order}. {item.name}
                      </p>
                      <p className="text-sm text-on-surface-variant truncate">
                        {item.description || '-'}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  )
}

export default TopicDetailPage
