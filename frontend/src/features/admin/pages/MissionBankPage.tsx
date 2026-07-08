import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Pencil, Power, PowerOff, Search, ChevronLeft, ChevronRight, Loader2, AlertCircle, Home, Users, School, FileText } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { Input } from '../../../shared/components/ui/Input'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { missionService } from '../../../core/services/missions'
import { programService } from '../../../core/services/programs'
import type { MissionBank, Program } from '../../../core/types'
import { MissionCategory } from '../../../core/types'
import { cn } from '../../../core/utils'

const CATEGORY_CONFIG = [
  { key: '', label: 'Semua', icon: null },
  { key: MissionCategory.HOME, label: 'HOME', icon: <Home className="w-4 h-4" /> },
  { key: MissionCategory.PARENT, label: 'PARENT', icon: <Users className="w-4 h-4" /> },
  { key: MissionCategory.SCHOOL, label: 'SCHOOL', icon: <School className="w-4 h-4" /> },
]

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  HOME: { icon: '🏠', color: 'bg-blue-100 text-blue-700' },
  PARENT: { icon: '👨‍👩‍👧', color: 'bg-purple-100 text-purple-700' },
  SCHOOL: { icon: '🏫', color: 'bg-amber-100 text-amber-700' },
}

const MissionBankPage = () => {
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()

  // Filters
  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Data
  const [missions, setMissions] = useState<MissionBank[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 10

  // Programs for dropdown
  const [programs, setPrograms] = useState<Program[]>([])

  // Stats
  const [stats, setStats] = useState<Record<string, number>>({ HOME: 0, PARENT: 0, SCHOOL: 0 })

  // Modal state - REMOVED
  // const [modalOpen, setModalOpen] = useState(false)
  // const [editingMission, setEditingMission] = useState<MissionBank | null>(null)
  // const [saving, setSaving] = useState(false)

  // Delete / deactivate
  const [deactivateTarget, setDeactivateTarget] = useState<MissionBank | null>(null)
  const [deactivating, setDeactivating] = useState(false)

  // Load programs
  useEffect(() => {
    programService.getAll({ limit: 100 }).then((res) => setPrograms(res.data))
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load missions
  const loadMissions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await missionService.getAll({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        filters: {
          ...(selectedProgram ? { program_id: selectedProgram } : {}),
          ...(selectedCategory ? { category: selectedCategory } : {}),
        },
      })
      setMissions(res.data)
      setTotal(res.total)
    } catch {
      setError('Gagal memuat data misi')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, selectedProgram, selectedCategory])

  useEffect(() => {
    loadMissions()
  }, [loadMissions])

  // Load stats
  const loadStats = useCallback(async () => {
    const counts: Record<string, number> = { HOME: 0, PARENT: 0, SCHOOL: 0 }
    for (const cat of ['HOME', 'PARENT', 'SCHOOL'] as const) {
      try {
        const res = await missionService.getAll({
          page: 1,
          limit: 1,
          filters: {
            ...(selectedProgram ? { program_id: selectedProgram } : {}),
            category: cat,
          },
        })
        counts[cat] = res.total
      } catch {
        counts[cat] = 0
      }
    }
    setStats(counts)
  }, [selectedProgram])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Load stages when program changes
  // const loadStages = useCallback(async (programId: string) => {
  //   if (!programId) {
  //     setStages([])
  //     return
  //   }
  //   try {
  //     const res = await programService.getStages(programId)
  //     setStages(res)
  //   } catch {
  //     setStages([])
  //   }
  // }, [])

  // Toggle active
  const handleToggleActive = async (mission: MissionBank) => {
    if (mission.is_active) {
      // Check min 3 active missions for this category+program
      try {
        const res = await missionService.getAll({
          page: 1,
          limit: 100,
          filters: {
            program_id: mission.program_id,
            category: mission.category,
          },
        })
        const activeCount = res.data.filter((m) => m.is_active && m.id !== mission.id).length
        if (activeCount < 3) {
          addToast({
            type: 'warning',
            message: `Tidak dapat menonaktifkan. Minimal 3 misi aktif diperlukan untuk kategori ${mission.category} di program ini. Saat ini hanya ${activeCount} misi aktif lainnya.`,
          })
          return
        }
      } catch {
        // If we can't check, proceed with toggle
      }
    }
    setDeactivateTarget(mission)
  }

  const confirmToggle = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await missionService.toggleActive(deactivateTarget.id)
      addToast({
        type: 'success',
        message: deactivateTarget.is_active ? 'Misi dinonaktifkan' : 'Misi diaktifkan',
      })
      loadMissions()
      loadStats()
    } catch {
      addToast({ type: 'error', message: 'Gagal mengubah status misi' })
    } finally {
      setDeactivating(false)
      setDeactivateTarget(null)
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const currentAction = deactivateTarget?.is_active ? 'Nonaktifkan' : 'Aktifkan'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Misi"
        subtitle="Kelola bank misi untuk program edutourism."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.MISSION_NEW)}>
            Tambah Misi Baru
          </Button>
        }
      />

      {/* Stats Banner */}
      <div className="bg-surface-container-low rounded-2xl px-6 py-4">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="text-sm text-on-surface-variant">Ringkasan Misi:</span>
          {CATEGORY_CONFIG.filter((c) => c.key).map((cat) => {
            const meta = CATEGORY_META[cat.key]
            const count = stats[cat.key] || 0
            return (
              <span key={cat.key} className="flex items-center gap-1.5 text-sm">
                <span>{meta.icon}</span>
                <span className="font-medium text-on-surface">{count}</span>
                <span className="text-on-surface-variant">misi {cat.label}</span>
              </span>
            )
          })}
          <span className="text-xs text-green-600 font-medium ml-auto">
            Semua kategori siap
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-low p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-end">
        <div className="w-full sm:w-64">
          <Select
            options={[
              { value: '', label: 'Semua Program' },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value)
              setPage(1)
            }}
            placeholder="Semua Program"
          />
        </div>
        <div className="flex-1">
          <Input
            leftIcon={<Search className="w-4 h-4" />}
            placeholder="Cari misi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 border-b border-outline-variant">
        {CATEGORY_CONFIG.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setSelectedCategory(cat.key)
              setPage(1)
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              selectedCategory === cat.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
            )}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">Memuat data misi...</span>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-on-error-container" />
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadMissions}>
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && missions.length === 0 && (
        <EmptyState
          icon={<FileText className="w-12 h-12" />}
          title="Belum ada misi"
          description={
            selectedProgram
              ? 'Belum ada misi untuk program ini. Klik "Tambah Misi Baru" untuk memulai.'
              : 'Pilih program atau klik "Tambah Misi Baru" untuk membuat misi pertama.'
          }
          action={
            selectedProgram
              ? { label: 'Tambah Misi Baru', onClick: () => navigate(ROUTES.ADMIN.MISSION_NEW) }
              : undefined
          }
        />
      )}

      {/* Mission Cards */}
      {!loading && !error && missions.length > 0 && (
        <div className="grid gap-4">
          {missions.map((mission) => {
            const meta = CATEGORY_META[mission.category] || CATEGORY_META.HOME
            return (
              <div
                key={mission.id}
                className="bg-surface rounded-2xl border border-outline-variant p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{meta.icon}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-on-surface truncate">
                        {mission.title_child}
                      </h3>
                      <p className="text-sm text-on-surface-variant mt-0.5">
                        {mission.title_parent}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={mission.is_active ? 'success' : 'neutral'}>
                      {mission.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                </div>

                {/* Description (expandable) */}
                {mission.description_parent && (
                  <details className="mt-3 group">
                    <summary className="text-xs text-primary cursor-pointer hover:text-primary-dark transition-colors">
                      {mission.description_parent.length > 80
                        ? 'Lihat deskripsi'
                        : 'Detail'}
                    </summary>
                    <p className="mt-2 text-sm text-on-surface-variant leading-relaxed">
                      {mission.description_parent}
                    </p>
                  </details>
                )}

                {/* Stage tags */}
                {mission.related_stage_ids && mission.related_stage_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {mission.related_stage_ids.map((stageId) => {
                      return (
                        <Badge key={stageId} variant="accent" size="sm">
                          {`Stage ${stageId.slice(-4)}`}
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-outline-variant">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil className="w-4 h-4" />}
                    onClick={() => navigate(`/admin/missions/${mission.id}/edit`)}
                  >
                    Edit
                  </Button>
                  {mission.is_active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<PowerOff className="w-4 h-4 text-warning" />}
                      onClick={() => handleToggleActive(mission)}
                    >
                      Nonaktifkan
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Power className="w-4 h-4 text-green-600" />}
                      onClick={() => setDeactivateTarget(mission)}
                    >
                      Aktifkan
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-on-surface-variant">
            {total} misi total — Halaman {page} dari {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft className="w-4 h-4" />}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            />
            <span className="text-sm text-on-surface-variant px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronRight className="w-4 h-4" />}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          </div>
        </div>
      )}

      {/* Toggle confirmation modal */}
      <Modal
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title={`${currentAction} Misi`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>
              Batal
            </Button>
            <Button
              variant={deactivateTarget?.is_active ? 'danger' : 'primary'}
              onClick={confirmToggle}
              loading={deactivating}
            >
              {currentAction}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Apakah Anda yakin ingin {currentAction.toLowerCase()} misi "{deactivateTarget?.title_child}"?
        </p>
      </Modal>
    </div>
  )
}

export default MissionBankPage
