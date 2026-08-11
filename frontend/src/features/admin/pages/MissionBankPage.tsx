import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Home,
  Users,
  School,
  FileText,
} from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Modal } from '../../../shared/components/ui/Modal'
import { Select } from '../../../shared/components/ui/Select'
import { Input } from '../../../shared/components/ui/Input'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { MissionCategory } from '../../../core/types'
import { cn } from '../../../core/utils'
import { useMissionBank } from '../hooks/useMissionBank'
import { MissionCard } from '../components/MissionCard'

const CATEGORY_CONFIG = [
  { key: '', label: 'Semua', icon: null },
  { key: MissionCategory.HOME, label: 'HOME', icon: <Home className="w-4 h-4" /> },
  { key: MissionCategory.PARENT, label: 'PARENT', icon: <Users className="w-4 h-4" /> },
  { key: MissionCategory.SCHOOL, label: 'SCHOOL', icon: <School className="w-4 h-4" /> },
]

const CATEGORY_META: Record<string, { icon: string }> = {
  HOME: { icon: '🏠' },
  PARENT: { icon: '👨‍👩‍👧' },
  SCHOOL: { icon: '🏫' },
}

const MissionBankPage = () => {
  const navigate = useNavigate()

  const {
    missions,
    programs,
    stats,
    loading,
    error,
    page,
    total,
    totalPages,
    selectedProgram,
    selectedCategory,
    searchQuery,
    deactivateTarget,
    deactivating,
    setSearchQuery,
    setPage,
    setSelectedProgram,
    setSelectedCategory,
    setDeactivateTarget,
    loadMissions,
    handleToggleActive,
    confirmToggle,
    stageMap,
  } = useMissionBank()

  const currentAction = deactivateTarget?.is_active ? 'Nonaktifkan' : 'Aktifkan'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Misi"
        subtitle="Kelola bank misi untuk program edutourism."
        actions={
          <Button
            icon={<Plus className="w-4 h-4" />}
            onClick={() => navigate(ROUTES.ADMIN.MISSION_NEW)}
          >
            Tambah Misi Baru
          </Button>
        }
      />

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
          <span className="text-xs text-green-600 font-medium ml-auto">Semua kategori siap</span>
        </div>
      </div>

      <div className="bg-surface-container-low p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-end">
        <div className="w-full sm:w-64">
          <Select
            options={[
              { value: '', label: 'Semua Program' },
              ...programs.map((p) => ({ value: p.id, label: p.name })),
            ]}
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
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

      <div className="flex gap-1 border-b border-outline-variant">
        {CATEGORY_CONFIG.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              selectedCategory === cat.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant',
            )}
          >
            {cat.icon}
            {cat.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-on-surface-variant">Memuat data misi...</span>
        </div>
      )}

      {!loading && error && (
        <div className="bg-error-container/30 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-on-error-container" />
          <p className="text-sm font-medium text-on-error-container mb-2">{error}</p>
          <Button variant="secondary" size="sm" onClick={loadMissions}>
            Coba Lagi
          </Button>
        </div>
      )}

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

      {!loading && !error && missions.length > 0 && (
        <div className="grid gap-4">
          {missions.map((mission) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              stageMap={stageMap}
              onEdit={(m) => navigate(`/admin/missions/${m.id}/edit`)}
              onToggleActive={handleToggleActive}
              onActivate={setDeactivateTarget}
            />
          ))}
        </div>
      )}

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
          Apakah Anda yakin ingin {currentAction.toLowerCase()} misi "{deactivateTarget?.title_child}
          "?
        </p>
      </Modal>
    </div>
  )
}

export default MissionBankPage
