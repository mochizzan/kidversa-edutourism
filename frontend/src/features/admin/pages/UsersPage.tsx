import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../../core/constants/app'
import { Plus, Pencil, Check, X as XIcon, Ban, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Tabs } from '../../../shared/components/ui/Tabs'
import { DataTable } from '../../../shared/components/data/DataTable'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { useHighlight } from '../../../shared/hooks/useHighlight'
import { useCrudList } from '../../../shared/hooks/useCrudList'
import { UserRole } from '../../../core/types/enums'
import { userService } from '../../../core/services/users'
import { tenantService } from '../../../core/services/tenants'
import { useAuth } from '../../../core/hooks/useAuth'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { canApproveUser } from '../../../core/utils/permissions'
import { ApprovalStatus } from '../../../core/types/enums'
import type { Column } from '../../../shared/components/data/DataTable'
import type { User, Tenant } from '../../../core/types'

type FilterTab = 'all' | 'pending' | 'active' | 'inactive' | 'rejected'

const ALLOWED_FILTERS: FilterTab[] = ['all', 'pending', 'active', 'inactive', 'rejected']

function parseFilter(value: string | null): FilterTab {
  return ALLOWED_FILTERS.includes(value as FilterTab) ? (value as FilterTab) : 'all'
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu Persetujuan' },
  { key: 'active', label: 'Aktif' },
  { key: 'inactive', label: 'Nonaktif' },
  { key: 'rejected', label: 'Ditolak' },
]

function approvalBadge(status: User['approval_status']) {
  switch (status) {
    case ApprovalStatus.PENDING:
      return <Badge variant="warning">Menunggu</Badge>
    case ApprovalStatus.APPROVED:
      return <Badge variant="success">Disetujui</Badge>
    case ApprovalStatus.REJECTED:
      return <Badge variant="danger">Ditolak</Badge>
    default:
      return <Badge variant="neutral">-</Badge>
  }
}

const UsersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user: currentUser } = useAuth()
  const { tenantId } = useTenantScope()
  const isSuperAdminView = currentUser?.role === UserRole.SUPER_ADMIN

  const [activeTab, setActiveTab] = useState<FilterTab>(parseFilter(searchParams.get('filter')))
  const [tenantFilter, setTenantFilter] = useState(searchParams.get('tenant') || '')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deactivateId, setDeactivateId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const { getHighlightClass } = useHighlight()

  useEffect(() => {
    if (!isSuperAdminView) return
    tenantService.getAll().then(setTenants).catch(() => setTenants([]))
  }, [isSuperAdminView])

  const tenantMap = new Map(tenants.map((t) => [t.id, t]))

  const buildFilters = useCallback(() => {
    const filters: Record<string, string | boolean | undefined> = {}

    if (activeTab === 'pending') {
      filters.approval_status = ApprovalStatus.PENDING
    } else if (activeTab === 'active') {
      filters.is_active = true
      filters.approval_status = ApprovalStatus.APPROVED
    } else if (activeTab === 'inactive') {
      filters.is_active = false
      filters.approval_status = ApprovalStatus.APPROVED
    } else if (activeTab === 'rejected') {
      filters.approval_status = ApprovalStatus.REJECTED
    }

    const effectiveTenant = isSuperAdminView ? tenantFilter : tenantId
    if (effectiveTenant) {
      filters.tenant_id = effectiveTenant
    }

    return filters
  }, [activeTab, tenantFilter, isSuperAdminView, tenantId])

  const { data: users, loading, error, page, total, setPage, setSearch, refresh } = useCrudList<User>({
    fetchFn: (params) => userService.getAll({ ...params, limit: 10, filters: buildFilters() }),
    additionalFilters: buildFilters(),
  })

  useEffect(() => {
    const spFilter = parseFilter(searchParams.get('filter'))
    const spTenant = searchParams.get('tenant') || ''
    let changed = false
    if (spFilter !== activeTab) { setActiveTab(spFilter); changed = true }
    if (spTenant !== tenantFilter) { setTenantFilter(spTenant); changed = true }
    if (changed) setPage(1)
  }, [searchParams])

  const handleTabChange = (key: string) => {
    setActiveTab(key as FilterTab)
    setPage(1)
    refresh()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('filter', key)
      return next
    }, { replace: true })
  }

  const handleTenantFilterChange = (tid: string) => {
    setTenantFilter(tid)
    setPage(1)
    refresh()
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (tid) {
        next.set('tenant', tid)
      } else {
        next.delete('tenant')
      }
      return next
    }, { replace: true })
  }

  const handleApprove = async () => {
    if (!approveId || !currentUser) return
    await userService.approve(approveId, currentUser.id)
    setApproveId(null)
    refresh()
  }

  const handleReject = async () => {
    if (!rejectId || !currentUser) return
    await userService.reject(rejectId, currentUser.id, rejectReason || undefined)
    setRejectId(null)
    setRejectReason('')
    refresh()
  }

  const handleDeactivate = async () => {
    if (!deactivateId) return
    await userService.deactivate(deactivateId)
    setDeactivateId(null)
    refresh()
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await userService.remove(deleteId)
    setDeleteId(null)
    setDeleteConfirmText('')
    refresh()
  }

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Nama',
      render: (item: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center overflow-hidden shrink-0">
            {item.avatar_url ? (
              <img src={item.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
            ) : (
              <span className="text-xs font-bold text-primary">{item.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="font-medium text-on-surface">{item.name}</p>
            <p className="text-sm text-on-surface-variant">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (item: User) => <Badge variant="primary">{item.role}</Badge>,
    },
    ...(isSuperAdminView
      ? [
          {
            key: 'tenant',
            header: 'Tenant',
            render: (item: User) => (
              <span className="text-sm text-on-surface-variant">
                {item.tenant_id ? tenantMap.get(item.tenant_id)?.name || '-' : 'Platform'}
              </span>
            ),
          } as Column<User>,
        ]
      : []),
    {
      key: 'approval_status',
      header: 'Persetujuan',
      render: (item: User) => approvalBadge(item.approval_status),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (item: User) => <Badge variant={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (item: User) => {
        const canApprove = canApproveUser(currentUser, item.tenant_id)
        const isPending = item.approval_status === ApprovalStatus.PENDING
        const isApprovedActive = item.approval_status === ApprovalStatus.APPROVED && item.is_active

        return (
          <div className="flex items-center justify-end gap-2">
            {canApprove && isPending && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Check className="w-4 h-4 text-green-600" />}
                  tooltip="Setujui"
                  onClick={() => setApproveId(item.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<XIcon className="w-4 h-4 text-error" />}
                  tooltip="Tolak"
                  onClick={() => setRejectId(item.id)}
                />
              </>
            )}
            {isApprovedActive && (
              <>
                <Link to={`/admin/users/${item.id}/edit`}>
                  <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip="Edit" />
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Ban className="w-4 h-4 text-error" />}
                  tooltip="Nonaktifkan"
                  onClick={() => setDeactivateId(item.id)}
                />
              </>
            )}
            {isSuperAdminView && item.id !== currentUser?.id && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4 text-error" />}
                tooltip="Hapus"
                onClick={() => setDeleteId(item.id)}
              />
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Kelola pengguna sistem."
        actions={
          <Link to={ROUTES.ADMIN.USER_NEW}>
            <Button icon={<Plus className="w-4 h-4" />}>Tambah User</Button>
          </Link>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>Coba Lagi</Button>
        </div>
      )}

      <Tabs tabs={TABS} activeKey={activeTab} onChange={handleTabChange} />

      {isSuperAdminView && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-on-surface-variant font-medium">Filter Tenant:</label>
          <select
            value={tenantFilter}
            onChange={(e) => handleTenantFilterChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface"
          >
            <option value="">Semua Tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <DataTable
        data={users}
        columns={columns}
        loading={loading}
        page={page}
        total={total}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: User) => item.id}
        rowClassName={(item: User) => getHighlightClass(item.id)}
      />

      <Modal open={!!approveId} onClose={() => setApproveId(null)} title="Setujui Pendaftaran" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setApproveId(null)}>Batal</Button>
          <Button variant="primary" onClick={handleApprove}>Setujui</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Setujui pendaftaran pengguna ini? Akun akan diaktifkan.</p>
      </Modal>

      <Modal open={!!rejectId} onClose={() => { setRejectId(null); setRejectReason('') }} title="Tolak Pendaftaran" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setRejectId(null); setRejectReason('') }}>Batal</Button>
          <Button variant="danger" onClick={handleReject}>Tolak</Button>
        </div>
      }>
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">Tolak pendaftaran pengguna ini?</p>
          <div>
            <label className="text-sm text-on-surface-variant mb-1 block">Alasan (opsional)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface resize-none"
              rows={3}
              placeholder="Alasan penolakan..."
            />
          </div>
        </div>
      </Modal>

      <Modal open={!!deactivateId} onClose={() => setDeactivateId(null)} title="Nonaktifkan User" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeactivateId(null)}>Batal</Button>
          <Button variant="danger" onClick={handleDeactivate}>Nonaktifkan</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">Apakah Anda yakin ingin menonaktifkan user ini?</p>
      </Modal>

      <Modal open={!!deleteId} onClose={() => { setDeleteId(null); setDeleteConfirmText('') }} title="Hapus User Secara Permanen" footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDeleteId(null); setDeleteConfirmText('') }}>Batal</Button>
          <Button variant="danger" disabled={deleteConfirmText !== 'HAPUS'} onClick={handleDelete}>Hapus Permanen</Button>
        </div>
      }>
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">Tindakan ini <b>tidak dapat dibatalkan</b> dan akan menghapus data user dari database. Ketik <b>HAPUS</b> untuk konfirmasi.</p>
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Ketik HAPUS"
            className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface"
          />
        </div>
      </Modal>
    </div>
  )
}

export default UsersPage
