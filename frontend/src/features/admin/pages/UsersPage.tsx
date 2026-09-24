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
import { useClientList, makeTextFilter } from '../../../shared/hooks/useClientList'
import { DEFAULT_CLIENT_PAGE_SIZE } from '../../../core/constants/api'
import { UserRole } from '../../../core/types/enums'
import { userService } from '../../../core/services/users'
import { tenantService } from '../../../core/services/tenants'
import { useAuth } from '../../../core/hooks/useAuth'
import { useTenantScope } from '../../../core/hooks/useTenantScope'
import { canApproveUser } from '../../../core/utils/permissions'
import { i18n } from '../../../core/i18n'
import { useTranslation, Trans } from 'react-i18next'
import { ApprovalStatus } from '../../../core/types/enums'
import type { Column } from '../../../shared/components/data/DataTable'
import type { User, Tenant } from '../../../core/types'

type FilterTab = 'all' | 'pending' | 'active' | 'inactive' | 'rejected'

const ALLOWED_FILTERS: FilterTab[] = ['all', 'pending', 'active', 'inactive', 'rejected']

function parseFilter(value: string | null): FilterTab {
  return ALLOWED_FILTERS.includes(value as FilterTab) ? (value as FilterTab) : 'all'
}

const TABS = [
  { key: 'all', labelKey: 'admin.common.all' },
  { key: 'pending', labelKey: 'admin.users.tabPending' },
  { key: 'active', labelKey: 'admin.status.active' },
  { key: 'inactive', labelKey: 'admin.status.inactive' },
  { key: 'rejected', labelKey: 'admin.status.rejected' },
] as const

function approvalBadge(status: User['approval_status']) {
  switch (status) {
    case ApprovalStatus.PENDING:
      return <Badge variant="warning">{i18n.t('admin.status.waiting')}</Badge>
    case ApprovalStatus.APPROVED:
      return <Badge variant="success">{i18n.t('admin.status.approved')}</Badge>
    case ApprovalStatus.REJECTED:
      return <Badge variant="danger">{i18n.t('admin.status.rejected')}</Badge>
    default:
      return <Badge variant="neutral">-</Badge>
  }
}

const UsersPage = () => {
  const { t } = useTranslation()
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

  const textFilter = makeTextFilter<User>(['name', 'email', 'role'])

  const filterFn = useCallback(
    (items: User[], search: string) => {
      let result = items

      if (activeTab === 'pending') {
        result = result.filter((u) => u.approval_status === ApprovalStatus.PENDING)
      } else if (activeTab === 'active') {
        result = result.filter((u) => u.approval_status === ApprovalStatus.APPROVED && u.is_active)
      } else if (activeTab === 'inactive') {
        result = result.filter((u) => u.approval_status === ApprovalStatus.APPROVED && !u.is_active)
      } else if (activeTab === 'rejected') {
        result = result.filter((u) => u.approval_status === ApprovalStatus.REJECTED)
      }

      const effectiveTenant = isSuperAdminView ? tenantFilter : tenantId
      if (effectiveTenant) {
        result = result.filter((u) => u.tenant_id === effectiveTenant)
      }

      return textFilter(result, search)
    },
    [activeTab, tenantFilter, isSuperAdminView, tenantId],
  )

  const { data: users, loading, error, page, totalItems, setPage, setSearch, refresh } = useClientList<User>({
    fetchFn: () => userService.getAll({ limit: 1000 }).then((r) => r.data),
    filterFn,
    deps: [tenantId],
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
      header: t('admin.col.name'),
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
      header: t('admin.col.role'),
      render: (item: User) => <Badge variant="primary">{item.role}</Badge>,
    },
    ...(isSuperAdminView
      ? [
        {
          key: 'tenant',
          header: t('admin.col.tenant'),
          render: (item: User) => (
            <span className="text-sm text-on-surface-variant">
              {item.tenant_id ? tenantMap.get(item.tenant_id)?.name || '-' : t('admin.users.platform')}
            </span>
          ),
        } as Column<User>,
      ]
      : []),
    {
      key: 'approval_status',
      header: t('admin.col.approval'),
      render: (item: User) => approvalBadge(item.approval_status),
    },
    {
      key: 'is_active',
      header: t('admin.col.status'),
      render: (item: User) => <Badge variant={item.is_active ? 'success' : 'neutral'}>{item.is_active ? t('admin.status.active') : t('admin.status.inactive')}</Badge>,
    },
    {
      key: 'actions',
      header: t('admin.col.action'),
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
                  tooltip={t('admin.common.approve')}
                  onClick={() => setApproveId(item.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<XIcon className="w-4 h-4 text-error" />}
                  tooltip={t('admin.common.reject')}
                  onClick={() => setRejectId(item.id)}
                />
              </>
            )}
            {isApprovedActive && (
              <Link to={`/admin/users/${item.id}/edit`}>
                <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} tooltip={t('admin.common.edit')} />
              </Link>
            )}
            {isApprovedActive && item.role !== UserRole.SUPER_ADMIN && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Ban className="w-4 h-4 text-error" />}
                tooltip={t('admin.common.deactivate')}
                onClick={() => setDeactivateId(item.id)}
              />
            )}
            {isSuperAdminView && item.id !== currentUser?.id && item.role !== UserRole.SUPER_ADMIN && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="w-4 h-4 text-error" />}
                tooltip={t('common.delete')}
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
        title={t('admin.sidebar.users')}
        subtitle={t('admin.users.pageSubtitle')}
        actions={
          <Link to={ROUTES.ADMIN.USER_NEW}>
            <Button icon={<Plus className="w-4 h-4" />}>{t('admin.users.add')}</Button>
          </Link>
        }
      />

      {error && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-error-container text-on-error-container text-sm">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" size="sm" onClick={refresh}>{t('common.error.retry')}</Button>
        </div>
      )}

      <Tabs
        tabs={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))}
        activeKey={activeTab}
        onChange={handleTabChange}
      />

      {isSuperAdminView && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-on-surface-variant font-medium">{t('admin.users.filterTenant')}</label>
          <select
            value={tenantFilter}
            onChange={(e) => handleTenantFilterChange(e.target.value)}
            className="px-3 py-1.5 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface"
          >
            <option value="">{t('admin.users.allTenants')}</option>
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
        total={totalItems}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
        onPageChange={setPage}
        onSearch={setSearch}
        getRowId={(item: User) => item.id}
        rowClassName={(item: User) => getHighlightClass(item.id)}
      />

      <Modal open={!!approveId} onClose={() => setApproveId(null)} title={t('admin.users.approveTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setApproveId(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleApprove}>{t('admin.common.approve')}</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">{t('admin.users.approveMsg')}</p>
      </Modal>

      <Modal open={!!rejectId} onClose={() => { setRejectId(null); setRejectReason('') }} title={t('admin.users.rejectTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setRejectId(null); setRejectReason('') }}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={handleReject}>{t('admin.common.reject')}</Button>
        </div>
      }>
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">{t('admin.users.rejectMsg')}</p>
          <div>
            <label className="text-sm text-on-surface-variant mb-1 block">{t('admin.users.rejectReasonLabel')}</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm outline-none bg-surface-container-low border-outline-variant/60 text-on-surface resize-none"
              rows={3}
              placeholder={t('admin.users.rejectReasonPlaceholder')}
            />
          </div>
        </div>
      </Modal>

      <Modal open={!!deactivateId} onClose={() => setDeactivateId(null)} title={t('admin.users.deactivateTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeactivateId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={handleDeactivate}>{t('admin.common.deactivate')}</Button>
        </div>
      }>
        <p className="text-sm text-on-surface-variant">{t('admin.users.deactivateMsg')}</p>
      </Modal>

      <Modal open={!!deleteId} onClose={() => { setDeleteId(null); setDeleteConfirmText('') }} title={t('admin.users.deleteTitle')} footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setDeleteId(null); setDeleteConfirmText('') }}>{t('common.cancel')}</Button>
          <Button variant="danger" disabled={deleteConfirmText !== 'HAPUS'} onClick={handleDelete}>{t('admin.users.deleteBtn')}</Button>
        </div>
      }>
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            <Trans i18nKey="admin.users.deleteMsg" components={{ b: <b /> }} />
          </p>
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
