import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, Eye } from 'lucide-react'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { DataTable, type Column } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { participantService } from '../../../core/services/participants'
import { sessionService } from '../../../core/services/sessions'
import { assessmentService } from '../../../core/services/assessments'
import { Modal } from '../../../shared/components/ui/Modal'
import { useCrudList } from '../../../shared/hooks/useCrudList'
import type { Assessment, Participant, Session } from '../../../core/types'
import { SessionStatus } from '../../../core/types'

interface ParticipantRow extends Participant {
  sessionName: string
  statusLabel: string
  assessedCount: number
}

const getSessionStatusLabel = (session?: Session | null) => {
  if (!session) return 'Sesi tidak ditemukan'
  if (session.status === SessionStatus.DRAFT) return 'Menunggu sesi'
  if (session.status === SessionStatus.ACTIVE) return 'Dalam sesi'
  if (session.status === SessionStatus.COMPLETED) return 'Sesi selesai'
  return 'Belum masuk sesi'
}

const ParticipantsPage = () => {
  const { addToast } = useGlobalToast()
  const { data: participants, loading, page, total, setPage, setSearch, refresh } = useCrudList<Participant>({
    fetchFn: (params) => participantService.getAll({ ...params, limit: 10 }),
  })
  const [sessionsById, setSessionsById] = useState<Record<string, Session>>({})
  const [assessmentsByParticipant, setAssessmentsByParticipant] = useState<Record<string, Assessment[]>>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadSessions = async () => {
      try {
        const sessionsRes = await sessionService.getAll({ limit: 100 })
        if (cancelled) return

        const sessionMap = sessionsRes.data.reduce<Record<string, Session>>((acc, session) => {
          acc[session.id] = session
          return acc
        }, {})

        setSessionsById(sessionMap)
      } catch (err) {
        if (!cancelled) {
          addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal memuat sesi' })
        }
      }
    }

    void loadSessions()

    return () => {
      cancelled = true
    }
  }, [addToast])

  useEffect(() => {
    let cancelled = false

    const loadAssessments = async () => {
      if (participants.length === 0) return

      const results: Record<string, Assessment[]> = {}
      await Promise.all(
        participants.map(async (p) => {
          const assessments = await assessmentService.getByParticipant(p.id)
          results[p.id] = assessments
        })
      )

      if (!cancelled) {
        setAssessmentsByParticipant(results)
      }
    }

    void loadAssessments()
    return () => {
      cancelled = true
    }
  }, [participants])

  const rows = useMemo<ParticipantRow[]>(() => {
    return participants.map((participant) => {
      const session = participant.session_id ? sessionsById[participant.session_id] : undefined
      const participantAssessments = assessmentsByParticipant[participant.id] ?? []

      let statusLabel = 'Belum masuk sesi'
      if (participant.session_id) {
        statusLabel = getSessionStatusLabel(session)
      }

      return {
        ...participant,
        sessionName: session?.name ?? 'Belum masuk sesi',
        statusLabel,
        assessedCount: participantAssessments.length,
      }
    })
  }, [participants, sessionsById, assessmentsByParticipant])

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      // Global participant deletes are not exposed by the backend; the
      // participant must be removed from its session instead.
      const target = participants.find((p) => p.id === deleteId)
      if (!target?.session_id) {
        addToast({ type: 'error', message: 'Peserta tanpa sesi tidak dapat dihapus dari sini' })
        setDeleteId(null)
        return
      }
      await sessionService.removeParticipant(target.session_id, deleteId)
      addToast({ type: 'success', message: 'Peserta berhasil dihapus' })
      setDeleteId(null)
      if (page > 1 && participants.length === 1) {
        setPage(page - 1)
      } else {
        refresh()
      }
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Gagal menghapus peserta' })
    }
  }

  const columns: Column<ParticipantRow>[] = [
    {
      key: 'child_name',
      header: 'Nama Peserta',
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.child_name}</p>
          <p className="text-xs text-on-surface-variant">Usia {item.child_age} tahun{item.school_name ? ` · ${item.school_name}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'parent_name',
      header: 'Orang Tua',
      render: (item) => (
        <div>
          <p className="font-medium text-on-surface">{item.parent_name}</p>
          <p className="text-xs text-on-surface-variant">{item.parent_phone}{item.parent_email ? ` · ${item.parent_email}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'sessionName',
      header: 'Sesi',
      render: (item) => <span>{item.sessionName}</span>,
    },
    {
      key: 'statusLabel',
      header: 'Status',
      render: (item) => <Badge variant={item.session_id ? 'primary' : 'neutral'}>{item.statusLabel}</Badge>,
    },
    {
      key: 'assessedCount',
      header: 'Penilaian',
      render: (item) => {
        if (!item.session_id) {
          return <Badge variant="neutral">Belum masuk sesi</Badge>
        }
        if (item.assessedCount > 0) {
          return <Badge variant="success">{item.assessedCount} tahap dinilai</Badge>
        }
        return <Badge variant="warning">Belum dinilai</Badge>
      },
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <Link to={`/admin/participants/${item.id}`}>
            <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} tooltip="Lihat detail" />
          </Link>
          <Link to={`/admin/participants/${item.id}/edit`}>
            <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit peserta" />
          </Link>
          <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-error" />} tooltip="Hapus peserta" onClick={() => setDeleteId(item.id)} />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Peserta"
        subtitle="Kelola data peserta dan pantau progres sesi mereka."
      />

      <DataTable
        data={rows}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        pageSize={10}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item) => item.id}
        ariaLabel="Daftar peserta"
        emptyState={<EmptyState title="Belum ada peserta" description="Tambahkan peserta baru untuk memulai." />}
      />

      <Modal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Hapus Peserta"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Hapus
            </Button>
          </div>
        }
      >
        <p className="text-sm text-on-surface-variant">
          Peserta yang sudah terhubung ke sesi atau memiliki aktivitas tidak dapat dihapus.
        </p>
      </Modal>
    </div>
  )
}

export default ParticipantsPage
