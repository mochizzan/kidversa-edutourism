import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Eye, Play, X, Calendar } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { DataTable } from '../../../shared/components/data/DataTable'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { sessionService } from '../../../core/services/sessions'
import type { Column } from '../../../shared/components/data/DataTable'
import type { Session } from '../../../core/types'
import { formatDate } from '../../../shared/utils'

const SessionsPage = () => {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter] = useState<string>('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await sessionService.getAll({ page, limit: 10, search, status: statusFilter || undefined })
      setSessions(res.data)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page])

  useEffect(() => {
    const timeout = setTimeout(load, 300)
    return () => clearTimeout(timeout)
  }, [search, statusFilter])

  const handleDelete = async () => {
    if (!deleteId) return
    await sessionService.cancel(deleteId)
    setDeleteId(null)
    load()
  }

  const columns: Column<Session>[] = [
    {
      key: 'name',
      header: 'Nama Sesi',
      sortable: true,
      render: (item: Session) => (
        <div>
          <p className="font-medium text-gray-900">{item.name}</p>
          <p className="text-sm text-gray-500">{item.location}</p>
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
          <Link to={`/admin/sessions/${item.id}`}>
            <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} />
          </Link>
          {item.status === 'DRAFT' && (
            <Button variant="ghost" size="sm" icon={<Play className="w-4 h-4 text-green-600" />} onClick={() => sessionService.start(item.id).then(load)} />
          )}
          <Button variant="ghost" size="sm" icon={<X className="w-4 h-4 text-red-500" />} onClick={() => setDeleteId(item.id)} />
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
          <Link to="/admin/sessions/new">
            <Button icon={<Plus className="w-4 h-4" />}>Buat Sesi</Button>
          </Link>
        }
      />

      <DataTable
        data={sessions}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: Session) => item.id}
        emptyState={
          <EmptyState
            icon={<Calendar className="w-12 h-12" />}
            title="Belum ada sesi"
            description="Buat sesi pertama untuk memulai."
            action={{ label: 'Buat Sesi', onClick: () => {} }}
          />
        }
      />

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Batalkan Sesi" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDelete}>Batalkan</Button>
        </div>
      }>
        <p className="text-sm text-gray-600">Apakah Anda yakin ingin membatalkan sesi ini?</p>
      </Modal>
    </div>
  )
}

export default SessionsPage
