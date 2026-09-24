import { useState, useEffect, useCallback } from 'react'
import { Building2, Plus, Edit2, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../../../shared/components/ui/PageHeader'
import { Button } from '../../../shared/components/ui/Button'
import { Badge } from '../../../shared/components/ui/Badge'
import { Modal } from '../../../shared/components/ui/Modal'
import { Input } from '../../../shared/components/ui/Input'
import { EmptyState } from '../../../shared/components/feedback/EmptyState'
import { useGlobalToast } from '../../../shared/components/feedback/Toast'
import { useTranslation } from 'react-i18next'
import { tenantService } from '../../../core/services/tenants'
import { useTenantStore } from '../../../core/stores/tenantStore'
import type { Tenant } from '../../../core/types'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const TenantsPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { addToast } = useGlobalToast()
  const { setTenants: setStoreTenants, setActiveTenant } = useTenantStore()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantUserCounts, setTenantUserCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Tenant | null>(null)
  const [formName, setFormName] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const loadTenants = useCallback(async () => {
    try {
      const [tenantList, stats] = await Promise.all([
        tenantService.getAll(),
        tenantService.getStats(),
      ])

      const userCounts = stats?.user_counts ?? []
      const counts: Record<string, number> = {}
      for (const row of userCounts) {
        counts[row.tenant_id] = row.count
      }

      setTenants(tenantList)
      setTenantUserCounts(counts)
      setStoreTenants(tenantList)
    } catch {
      // Surface the error instead of silently rendering empty counts.
      addToast({ type: 'error', message: t('admin.tenants.loadError') })
    } finally {
      setLoading(false)
    }
  }, [setStoreTenants, addToast, t])

  useEffect(() => {
    loadTenants()
  }, [loadTenants])

  const openCreate = () => {
    setFormName('')
    setFormSlug('')
    setFormError(null)
    setShowCreateModal(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditTarget(tenant)
    setFormName(tenant.name)
    setFormSlug(tenant.slug)
    setFormError(null)
    setShowEditModal(true)
  }

  const handleNameChange = (value: string) => {
    setFormName(value)
    if (!showEditModal || formSlug === slugify(formName)) {
      setFormSlug(slugify(value))
    }
  }

  const validateSlug = (slug: string, excludeId?: string): string | null => {
    if (!formName.trim()) return t('admin.tenants.nameRequired')
    if (!slug.trim()) return t('admin.tenants.slugRequired')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return t('admin.tenants.slugFormat')
    const duplicate = tenants.find((t) => t.slug === slug && t.id !== excludeId)
    if (duplicate) return t('admin.tenants.slugTaken', { slug, name: duplicate.name })
    return null
  }

  const handleSaveCreate = async () => {
    const error = validateSlug(formSlug)
    if (error) { setFormError(error); return }

    // Tenant creation is handled server-side (bootstrap); the frontend has no
    // mutation endpoint for tenants, so we surface an informational message.
    addToast({ type: 'info', message: t('admin.tenants.createInfo') })
    setShowCreateModal(false)
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    const error = validateSlug(formSlug, editTarget.id)
    if (error) { setFormError(error); return }

    addToast({ type: 'info', message: t('admin.tenants.editInfo') })
    setShowEditModal(false)
    setEditTarget(null)
  }

  const handleViewUsers = (tenant: Tenant) => {
    setActiveTenant(tenant)
    navigate(`/admin/users?tenant=${tenant.id}`)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('admin.tenants.title')} subtitle={t('admin.tenants.subtitle')} />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-2xl p-6 shadow-sm">
              <div className="h-5 bg-surface-container-high rounded w-1/3 mb-3" />
              <div className="h-4 bg-surface-container-high rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const tenantFormModal = (
    <>
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('admin.tenants.add')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSaveCreate}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('admin.tenants.nameLabel')}
            value={formName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('admin.tenants.namePlaceholder')}
          />
          <Input
            label={t('admin.tenants.slugLabel')}
            value={formSlug}
            onChange={(e) => setFormSlug(e.target.value.toLowerCase())}
            placeholder={t('admin.tenants.slugPlaceholder')}
            hint={t('admin.tenants.slugHint')}
          />
          {formError && <p className="text-sm text-error">{formError}</p>}
        </div>
      </Modal>

      <Modal
        open={showEditModal}
        onClose={() => { setShowEditModal(false); setEditTarget(null) }}
        title={t('admin.tenants.editTitle')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditTarget(null) }}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSaveEdit}>{t('common.save')}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('admin.tenants.nameLabel')}
            value={formName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={t('admin.tenants.namePlaceholder')}
          />
          <Input
            label={t('admin.tenants.slugLabel')}
            value={formSlug}
            onChange={(e) => setFormSlug(e.target.value.toLowerCase())}
            placeholder={t('admin.tenants.slugPlaceholder')}
            hint={t('admin.tenants.slugHint')}
          />
          {formError && <p className="text-sm text-error">{formError}</p>}
        </div>
      </Modal>
    </>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.tenants.title')}
        subtitle={t('admin.tenants.subtitle')}
        actions={
          <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
            {t('admin.tenants.add')}
          </Button>
        }
      />

      {tenants.length === 0 ? (
        <EmptyState
          icon={<Building2 className="w-12 h-12" />}
          title={t('admin.tenants.emptyTitle')}
          description={t('admin.tenants.emptyDesc')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenants.map((tenant) => (
            <div
              key={tenant.id}
              className="bg-surface rounded-2xl p-6 shadow-sm border border-outline-variant/50 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary-container flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="neutral">{tenant.slug}</Badge>
              </div>

              <h3 className="text-lg font-bold text-on-surface mb-1">{tenant.name}</h3>
              <p className="text-sm text-on-surface-variant mb-4">
                {t('admin.tenants.userCount', { count: tenantUserCounts[tenant.id] || 0 })}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Users className="w-4 h-4" />}
                  onClick={() => handleViewUsers(tenant)}
                >
                  {t('admin.tenants.viewUsers')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Edit2 className="w-4 h-4" />}
                  onClick={() => openEdit(tenant)}
                >
                  {t('admin.common.edit')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tenantFormModal}
    </div>
  )
}

export default TenantsPage
