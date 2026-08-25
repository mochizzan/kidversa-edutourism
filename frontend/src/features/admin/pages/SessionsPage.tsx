import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Eye, Play, X, Calendar, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useCrudList } from '../../../shared/hooks/useCrudList'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Session } from '../../../core/types'
import type { SessionSubstage } from '../../../core/types'
import { formatDate } from '../../../shared/utils'
import { friendlyError } from '../../../core/utils/errorMessages'

const SessionsPage = () => {
  const navigate = useNavigate()
  const { data: sessions, loading, error, page, total, setPage, setSearch, refresh } = useCrudList<Session>({
    fetchFn: (params) => sessionService.getAll({ ...params, limit: 10 }),
    scopeToTenant: true,
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [ungradedGroupName, setUngradedGroupName] = useState<string | null>(null)
  const { getHighlightClass } = useHighlight()
  const { addToast } = useGlobalToast()

  const handleDelete = async () => {
    if (!deleteId || cancelling) return
    setCancelling(true)
    try {
      await sessionService.cancel(deleteId)
      addToast({ type: 'success', message: 'Sesi berhasil dibatalkan' })
      setDeleteId(null)
      refresh()
    } catch {
      addToast({ type: 'error', message: 'Gagal membatalkan sesi' })
    } finally {
      setCancelling(false)
    }
  }

  const handlePermanentDelete = async () => {
    if (!deletingId || deleting) return
    setDeleting(true)
    try {
      await sessionService.delete(deletingId)
      addToast({ type: 'success', message: 'Sesi berhasil dihapus' })
      setDeletingId(null)
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setDeleting(false)
    }
  }

  // Start gate: every group must have a facilitator assigned.
  const canStart = async (id: string): Promise<boolean> => {
    try {
      const detail = await sessionService.getById(id)
      if (!detail) return false
      const unassigned = detail.groups.filter((g) => !g.facilitator_id).length
      if (unassigned > 0) {
        const names = detail.groups.filter((g) => !g.facilitator_id).map((g) => g.name).join(', ')
        addToast({ type: 'error', message: `Setiap kelompok harus memiliki fasilitator. Kelompok tanpa fasilitator: ${names}` })
        return false
      }
      return true
    } catch {
      addToast({ type: 'error', message: 'Gagal memeriksa penugasan fasilitator' })
      return false
    }
  }

  const handleStart = async (id: string) => {
    if (startingId) return
    if (!(await canStart(id))) return
    setStartingId(id)
    try {
      await sessionService.start(id)
      addToast({ type: 'success', message: 'Sesi berhasil dimulai' })
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setStartingId(null)
    }
  }

  // Complete gate: every participant in every group must be graded for all Kegiatan.
  const canComplete = async (id: string): Promise<boolean> => {
    const detail = await sessionService.getById(id)
    if (!detail) return false
    const subs: SessionSubstage[] = await sessionService.getSubstages(id)
    const subIDs = subs.map((s) => s.id)
    if (subIDs.length === 0) return true
    const assessments = await assessmentService.getBySession(id)
    const graded = new Set<string>()
    for (const a of assessments) {
      if (a.star_rating >= 1) graded.add(`${a.participant_id}__${a.session_substage_id}`)
    }
    for (const group of detail.groups) {
      for (const p of group.participants) {
        const fully = subIDs.every((sid) => graded.has(`${p.id}__${sid}`))
        if (!fully) {
          setUngradedGroupName(group.name)
          return false
        }
      }
    }
    return true
  }

  const handleComplete = async (id: string) => {
    if (completingId) return
    const ok = await canComplete(id)
    if (!ok) return
    setCompletingId(id)
    try {
      await sessionService.complete(id)
      addToast({ type: 'success', message: 'Sesi berhasil diselesaikan' })
      refresh()
    } catch (err) {
      addToast({ type: 'error', message: friendlyError(err) })
    } finally {
      setCompletingId(null)
    }
  }

  const columns: Column<Session>[] = [
    {
      key: 'name',
      header: 'Nama Sesi',
      sortable: true,
      render: (item: Session) => (
        <div>
          <p className="font-medium text-on-surface">{item.name}</p>
          <p className="text-sm text-on-surface-variant">{item.location}</p>
        </div>
      ),
    },
    {
      key: 'session_date',
      header: 'Tanggal',
      render: (item: Session) => formatDate(item.session_date),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Session) => {
        const variants: Record<string, 'primary' | 'success' | 'neutral' | 'danger'> = {
          DRAFT: 'neutral',
          ACTIVE: 'success',
          COMPLETED: 'primary',
          CANCELLED: 'danger',
        }
        return <Badge variant={variants[item.status] || 'neutral'}>{item.status}</Badge>
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item: Session) => (
          <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} tooltip="Lihat Detail" onClick={() => navigate(`/admin/sessions/${item.id}`)} />
          {item.status === 'DRAFT' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Play className="w-4 h-4 text-green-600" />}
              tooltip="Mulai Sesi"
              loading={startingId === item.id}
              disabled={!!startingId}
              onClick={() => handleStart(item.id)}
            />
          )}
          {item.status === 'ACTIVE' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<CheckCircle2 className="w-4 h-4 text-blue-600" />}
              tooltip="Selesaikan Sesi"
              loading={completingId === item.id}
              disabled={!!completingId}
              onClick={() => handleComplete(item.id)}
            />
          )}
          {(item.status === 'DRAFT' || item.status === 'ACTIVE') && (
            <Button variant="ghost" size="sm" icon={<X className="w-4 h-4 text-error" />} tooltip="Batalkan" onClick={() => setDeleteId(item.id)} />
          )}
          {(item.status === 'DRAFT' || item.status === 'CANCELLED') && (
            <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Hapus Sesi" onClick={() => setDeletingId(item.id)} />
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        subtitle="Kelola sesi edutourism."
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => navigate(ROUTES.ADMIN.SESSION_NEW)}>Buat Sesi</Button>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>Coba Lagi</Button>
        </div>
      )}

      <DataTable
        data={sessions}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: Session) => item.id}
        rowClassName={(item: Session) => getHighlightClass(item.id)}
        emptyState={
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title="Belum ada sesi"
            description="Buat sesi pertama untuk memulai."
            action={{ label: 'Buat Sesi', onClick: () => navigate(ROUTES.ADMIN.SESSION_NEW) }}
          />
        }
      />

      <Modal open={!!deleteId} onClose={() => { if (!cancelling) setDeleteId(null) }} closeOnOverlay={!cancelling} title="Batalkan Sesi" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)} disabled={cancelling}>Batal</Button>
          <Button variant="danger" onClick={handleDelete} loading={cancelling}>Batalkan</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin membatalkan sesi ini?</p>
      </Modal>

      <Modal open={!!deletingId} onClose={() => { if (!deleting) setDeletingId(null) }} closeOnOverlay={!deleting} title="Hapus Sesi" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeletingId(null)} disabled={deleting}>Batal</Button>
          <Button variant="danger" onClick={handlePermanentDelete} loading={deleting}>Hapus</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menghapus sesi ini secara permanen? Seluruh data terkait (kelompok, peserta, konten, laporan) juga akan dihapus. Tindakan ini tidak dapat dibatalkan.</p>
      </Modal>

      <Modal open={ungradedGroupName !== null} onClose={() => setUngradedGroupName(null)} title="Belum Dapat Menyelesaikan Sesi" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setUngradedGroupName(null)}>Tutup</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">There are ungraded students in group {ungradedGroupName}</p>
      </Modal>
    </div>
  )
}

export default SessionsPage
